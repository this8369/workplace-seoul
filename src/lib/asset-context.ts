import { useEffect, useState } from "react";
import { supabase } from "./supabase";
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
export function useAssetContext(buildingId: string) {
  const [register, setRegister] = useState<Resource<RegisterData>>({
    data: null,
    error: false,
  });
  const [parcels, setParcels] = useState<Resource<Parcel[]>>({
    data: null,
    error: false,
  });
  const [places, setPlaces] = useState<Resource<Place[]>>({
    data: null,
    error: false,
  });
  const [facts, setFacts] = useState<Resource<AssetFact[]>>({
    data: null,
    error: false,
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    const pending = { data: null, error: false };
    setRegister(pending);
    setParcels(pending);
    setPlaces(pending);
    setFacts(pending);
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
    function request<T>(promise: Promise<T>, setter: (r: Resource<T>) => void) {
      promise
        .then((data) => {
          if (alive) setter({ data, error: false });
        })
        .catch(() => {
          if (alive) setter({ data: null, error: true });
        });
    }
    request(fetchBuildingRegister(buildingId), setRegister);
    request(rows<Parcel>("building_parcels"), setParcels);
    request(rows<Place>("building_places"), setPlaces);
    request(rows<AssetFact>("building_facts"), setFacts);
    return () => {
      alive = false;
    };
  }, [buildingId, attempt]);
  return {
    register,
    parcels,
    places,
    facts,
    retry: () => setAttempt((v) => v + 1),
  };
}
