import { useEffect, useState } from "react";
import { publicSupabase as supabase } from "./public-supabase";
import { fetchBuildingRegister, type RegisterData } from "./building-register";

export type ParcelGeometry =
  | {
      type: "Polygon";
      coordinates: number[][][];
    }
  | { type: "MultiPolygon"; coordinates: number[][][][] };
export type Parcel = {
  id: string;
  pnu: string;
  address: string;
  is_primary: boolean;
  area_m2: number | null;
  land_category: string | null;
  land_use: string | null;
  terrain: string | null;
  shape: string | null;
  road_condition: string | null;
  ownership_type: string | null;
  ownership_changed_on: string | null;
  coowners: number | null;
  geometry: ParcelGeometry | null;
  zoning: { name: string; relation: string }[];
  official_prices: {
    year: number;
    price_won_m2: number;
    as_of?: string | null;
  }[];
  source_name: string;
  source_url: string | null;
  as_of: string | null;
};
export type Place = {
  id: string;
  category: "transit" | "education" | "amenity";
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  distance_m: number | null;
  walking_minutes: number | null;
  walking_source: string | null;
  source_name: string;
  source_url: string | null;
  as_of: string | null;
};
export type AssetFact = {
  id: string;
  category: string;
  field_key: string;
  value: unknown;
  unit: string | null;
  source_name: string;
  source_url: string | null;
  as_of: string;
};
export type Resource<T> = { data: T | null; error: boolean };
const requests = new Map<string, { at: number; promise: Promise<unknown> }>();
function useDeferred<T>(
  key: string,
  enabled: boolean,
  loader: () => Promise<T>,
): Resource<T> {
  const [state, setState] = useState<{ key: string; resource: Resource<T> }>({
    key: "",
    resource: { data: null, error: false },
  });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let request = requests.get(key);
    if (!request || Date.now() - request.at > 5 * 60_000) {
      request = { at: Date.now(), promise: loader() };
      requests.set(key, request);
      if (requests.size > 64) requests.delete(requests.keys().next().value!);
    }
    request.promise
      .then((data) => {
        if (alive)
          setState({ key, resource: { data: data as T, error: false } });
      })
      .catch(() => {
        requests.delete(key);
        if (alive) setState({ key, resource: { data: null, error: true } });
      });
    return () => {
      alive = false;
    };
  }, [key, enabled]);
  return state.key === key ? state.resource : { data: null, error: false };
}
export function useAssetContext(buildingId: string, tab = "개요") {
  const [attempt, setAttempt] = useState(0);
  async function rows<T>(table: string): Promise<T[]> {
    if (!supabase) throw new Error("not-configured");
    const all: T[] = [];
    for (let from = 0; ; from += 500) {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("building_id", buildingId)
        .order("id")
        .range(from, from + 499);
      if (error) throw error;
      all.push(...(data as T[]));
      if (data.length < 500) return all;
    }
  }
  const details = tab === "건축물대장",
    sources = tab === "자료 출처";
  const key = `${buildingId}:${attempt}`;
  const register = useDeferred<RegisterData>(
    `${key}:register:${details}`,
    details || tab === "토지" || sources,
    () => fetchBuildingRegister(buildingId, details),
  );
  const parcels = useDeferred<Parcel[]>(
    `${key}:parcels`,
    tab === "토지" || sources,
    () => rows<Parcel>("building_parcels"),
  );
  const places = useDeferred<Place[]>(
    `${key}:places`,
    tab === "주변" || sources,
    () => rows<Place>("building_places"),
  );
  const facts = useDeferred<AssetFact[]>(
    `${key}:facts`,
    tab === "개요" || sources,
    () => rows<AssetFact>("building_facts"),
  );
  return {
    register,
    parcels,
    places,
    facts,
    retry: () => setAttempt((n) => n + 1),
  };
}
