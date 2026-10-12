import { createClient } from "@supabase/supabase-js";
import { publicSupabase } from "./public-supabase";
import type { Building } from "./domain";
import {
  configureDistricts,
  type DistrictRecord,
  regionForBuilding,
} from "./map-regions";
const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          detectSessionInUrl:
            new URLSearchParams(location.search).get("igis-recovery") !== "1",
        },
      })
    : null;
export async function fetchBuildings(): Promise<Building[]> {
  if (!publicSupabase) throw new Error("not-configured");
  const rows: Building[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await publicSupabase
      .from("catalog_buildings")
      .select("*")
      .in("status", ["operating", "development"])
      .order("id")
      .range(from, from + 499);
    if (error) throw error;
    rows.push(
      ...(data as Building[]).map((b) => ({
        ...b,
        overview: null,
        floors_above: null,
        floors_below: null,
        parking_spaces: null,
        source_name: "",
        source_url: null,
        verified_on: null,
        source_address: b.address,
        region: regionForBuilding(b),
        address: b.standard_address || b.address,
      })),
    );
    if (data.length < 500) break;
  }
  return rows;
}

import { emptyCatalog, type Catalog } from "./catalog";
const coreListeners = new Set<(data: Catalog) => void>();
let catalogRequest: Promise<Catalog> | undefined;
const cacheKey = `workplace-catalog-public-v10:${url}`;
// Discard older snapshots containing fields which are now member-only.
try {
  for (const key of Object.keys(sessionStorage))
    if (
      (key.startsWith("workplace-catalog-") && key !== cacheKey) ||
      key.startsWith("workplace-photo-urls-v1:")
    )
      sessionStorage.removeItem(key);
} catch {
  /* Storage can be disabled. */
}
function cachedCatalog(): Catalog | null {
  try {
    const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
    if (!cached || Date.now() - cached.at > 5 * 60_000) return null;
    configureDistricts(cached.districts);
    return cached.catalog;
  } catch {
    return null;
  }
}
export function fetchCatalog(
  onCore?: (data: Catalog) => void,
): Promise<Catalog> {
  const cached = cachedCatalog();
  if (cached) onCore?.(cached);
  if (onCore) coreListeners.add(onCore);
  if (!catalogRequest)
    catalogRequest = loadCatalog().finally(() => {
      catalogRequest = undefined;
    });
  return catalogRequest.finally(() => {
    if (onCore) coreListeners.delete(onCore);
  });
}
async function all(table: string) {
  if (!publicSupabase) return [];
  const rows: unknown[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await publicSupabase
      .from(table)
      .select("*")
      .order("id")
      .range(from, from + 499);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}
async function loadCatalog(): Promise<Catalog> {
  if (!publicSupabase) return emptyCatalog;
  // Only identity, photos and region geometry block the first card list.
  const [buildings, images, districts] = await Promise.all([
    fetchBuildings(),
    all("catalog_images"),
    publicSupabase.from("districts").select("*").order("sort_order"),
  ]);
  if (districts.error) throw districts.error;
  configureDistricts(districts.data as DistrictRecord[]);
  const core = {
    ...emptyCatalog,
    buildings: buildings.map((b) => ({ ...b, region: regionForBuilding(b) })),
    images: images as Catalog["images"],
    review: true,
  };
  coreListeners.forEach((notify) => notify(core));
  // Card metrics and map grouping follow immediately; archive data is on demand.
  const [leasing, developments, complexes, towers] = await Promise.all([
    all("catalog_leasing"),
    all("catalog_developments"),
    all("catalog_complexes"),
    all("catalog_towers"),
  ]);
  const catalog = {
    ...core,
    leasing,
    developments,
    complexes,
    towers,
  } as Catalog;
  try {
    sessionStorage.setItem(
      cacheKey,
      JSON.stringify({ at: Date.now(), districts: districts.data, catalog }),
    );
  } catch {
    /* Cache is optional. */
  }
  return catalog;
}
export type CatalogArchive = Pick<
  Catalog,
  "transactions" | "companies" | "occupancies" | "movements"
>;
let archiveRequest: Promise<CatalogArchive> | undefined;
export function fetchCatalogArchive(): Promise<CatalogArchive> {
  if (!archiveRequest)
    archiveRequest = all("catalog_transactions")
      .then(
        (transactions) =>
          ({
            transactions,
            companies: [],
            occupancies: [],
            movements: [],
          }) as CatalogArchive,
      )
      .finally(() => {
        archiveRequest = undefined;
      });
  return archiveRequest;
}
