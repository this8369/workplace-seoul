import { fetchBuildingImages } from "./building-images";
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
      .from("buildings")
      .select(
        "id,complex_id,name,address,standard_address,road_address,region,status,gross_area_m2,area_basis,latitude,longitude,overview,floors_above,floors_below,completion_year,usage_approved_on,completion_source_url,completion_collected_at,typical_floor_rentable_pyeong,typical_floor_exclusive_pyeong,typical_floor_scope,typical_floor_source_url,typical_floor_source_period,typical_floor_collected_at,parking_spaces,source_name,source_url,verified_on,source_as_of",
      )
      .order("id")
      .range(from, from + 499);
    if (error) throw error;
    rows.push(
      ...(data as Building[]).map((b) => ({
        ...b,
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
const cacheKey = `workplace-catalog-v2:${url}`;
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
    fetchBuildingImages(publicSupabase),
    publicSupabase.from("districts").select("*").order("sort_order"),
  ]);
  if (districts.error) throw districts.error;
  configureDistricts(districts.data as DistrictRecord[]);
  const core = {
    ...emptyCatalog,
    buildings: buildings.map((b) => ({ ...b, region: regionForBuilding(b) })),
    images,
    review: true,
  };
  coreListeners.forEach((notify) => notify(core));
  // Card metrics and map grouping follow immediately; archive data is on demand.
  const [leasing, developments, complexes, towers] = await Promise.all([
    all("leasing_quarters"),
    all("development_records"),
    all("building_complexes"),
    all("building_towers"),
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
    archiveRequest = Promise.all([
      all("transactions"),
      all("companies"),
      all("occupancies"),
      all("tenant_movements"),
    ])
      .then(
        ([transactions, companies, occupancies, movements]) =>
          ({
            transactions,
            companies,
            occupancies,
            movements,
          }) as CatalogArchive,
      )
      .finally(() => {
        archiveRequest = undefined;
      });
  return archiveRequest;
}
