import { fetchBuildingImages } from "./building-images";
import { createClient } from "@supabase/supabase-js";
import type { Building } from "./domain";
import {
  configureDistricts,
  type DistrictRecord,
  regionForBuilding,
} from "./map-regions";
const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase = url && key ? createClient(url, key) : null;
export async function fetchBuildings(): Promise<Building[]> {
  if (!supabase) throw new Error("not-configured");
  const rows: Building[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase
      .from("buildings")
      .select(
        "id,name,address,standard_address,road_address,region,status,gross_area_m2,area_basis,latitude,longitude,overview,floors_above,floors_below,completion_year,typical_floor_area_pyeong,parking_spaces,source_name,source_url,verified_on,source_as_of",
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
export async function fetchCatalog(): Promise<Catalog> {
  if (!supabase) return emptyCatalog;
  const districtResult = await supabase
    .from("districts")
    .select("*")
    .order("sort_order");
  if (districtResult.error) throw districtResult.error;
  configureDistricts(districtResult.data as DistrictRecord[]);
  async function all(table: string) {
    const result: unknown[] = [];
    for (let from = 0; ; from += 500) {
      const { data, error } = await supabase!
        .from(table)
        .select("*")
        .order("id")
        .range(from, from + 499);
      if (error) throw error;
      result.push(...data);
      if (data.length < 500) return result;
    }
  }
  const [
    buildings,
    transactions,
    companies,
    occupancies,
    movements,
    leasing,
    developments,
    images,
  ] = await Promise.all([
    fetchBuildings(),
    all("transactions"),
    all("companies"),
    all("occupancies"),
    all("tenant_movements"),
    all("leasing_quarters"),
    all("development_records"),
    fetchBuildingImages(),
  ]);
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const access = session
    ? await supabase.rpc("can_review_records")
    : { data: false, error: null };
  if (access.error) throw access.error;
  return {
    buildings,
    transactions,
    companies,
    occupancies,
    movements,
    leasing,
    developments,
    images,
    review: access.data === true,
  } as Catalog;
}
