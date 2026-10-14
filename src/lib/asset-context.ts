import { useEffect, useRef, useState } from "react";
import { assetDetailClient as supabase } from "./asset-detail-client";
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
  building_id: string;
  category: string;
  field_key: string;
  complex_id?: string | null;
  value: unknown;
  unit: string | null;
  source_name: string;
  source_url: string | null;
  as_of: string | null;
};
export type Resource<T> = { data: T | null; error: boolean };
function useDeferred<T>(
  key: string,
  enabled: boolean,
  loader: () => Promise<T>,
): Resource<T> {
  // Private responses live only as long as this member's detail component.
  const requests = useRef(
    new Map<string, { at: number; promise: Promise<T> }>(),
  ).current;
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
export function useAssetContext(
  buildingId: string,
  tab: string | readonly string[] = "개요",
  revision = 0,
) {
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
  const enabled = (name: string) =>
    typeof tab === "string" ? tab === name : tab.includes(name);
  const details = enabled("건축물대장"),
    sources = enabled("자료 출처");
  const key = `${buildingId}:${attempt}:${revision}`;
  const register = useDeferred<RegisterData>(
    `${key}:register:${details}`,
    details || enabled("개요") || enabled("토지") || sources,
    () => fetchBuildingRegister(buildingId, details),
  );
  const parcels = useDeferred<Parcel[]>(
    `${key}:parcels`,
    enabled("토지") || sources,
    () => rows<Parcel>("building_parcels"),
  );
  const places = useDeferred<Place[]>(
    `${key}:places`,
    enabled("주변") || enabled("개요") || sources,
    () => rows<Place>("building_places"),
  );
  const facts = useDeferred<AssetFact[]>(
    `${key}:facts`,
    enabled("개요") || sources,
    async () =>
      (await rows<AssetFact>("building_facts")).filter((f) => !f.complex_id),
  );
  const natureSources = useDeferred<
    { id: string; source_name: string; source_url: string; as_of: string }[]
  >(`${key}:nature-sources`, sources, () => rows("building_green_spaces"));
  return {
    register,
    parcels,
    places,
    facts,
    natureSources,
    retry: () => setAttempt((n) => n + 1),
  };
}
