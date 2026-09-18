import data from "../data/district-boundaries.json" with { type: "json" };
import displayData from "../data/district-display-boundaries.json" with { type: "json" };
import type { Building } from "./domain.ts";

export type DistrictKey = "CBD" | "GBD" | "YBD" | "Others" | "BBD";
type Coordinate = [number, number]; // longitude, latitude
export type DistrictBoundary = {
  properties: { key: DistrictKey; labelPosition: Coordinate };
  bbox: [number, number, number, number];
  geometry: { type: "MultiPolygon"; coordinates: Coordinate[][][] };
};
export const boundaries = data.features as unknown as DistrictBoundary[];
const displayOverrides = displayData.features as unknown as DistrictBoundary[];
// Editorial mountain trims affect map display/navigation only, never membership.
export const displayBoundaries = boundaries.map(
  (boundary) =>
    displayOverrides.find(
      (b) => b.properties.key === boundary.properties.key,
    ) || boundary,
);
export const districts = [
  { key: "CBD", label: "CBD", name: "종로구 · 중구", color: "#253985" },
  {
    key: "GBD",
    label: "GBD",
    name: "강남구 · 서초구 · 송파구 신천동·잠실동",
    color: "#287aab",
  },
  { key: "YBD", label: "YBD", name: "여의도동", color: "#287f78" },
  {
    key: "Others",
    label: "서울 기타",
    name: "서울 내 CBD · GBD · YBD 외 지역",
    color: "#778397",
  },
  {
    key: "BBD",
    label: "BBD",
    name: "성남시 분당구 · 판교 포함",
    color: "#7561a8",
  },
] as const;

function inRing([x, y]: Coordinate, ring: Coordinate[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}
export function boundaryContains(
  boundary: DistrictBoundary,
  longitude: number,
  latitude: number,
): boolean {
  const [w, s, e, n] = boundary.bbox;
  const point: Coordinate = [longitude, latitude];
  return (
    longitude >= w &&
    longitude <= e &&
    latitude >= s &&
    latitude <= n &&
    boundary.geometry.coordinates.some(
      ([outer, ...holes]) =>
        inRing(point, outer) && !holes.some((hole) => inRing(point, hole)),
    )
  );
}
export function districtAt(
  longitude: number,
  latitude: number,
): DistrictKey | undefined {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return;
  return boundaries.find((b) => boundaryContains(b, longitude, latitude))
    ?.properties.key;
}

// Standard lot addresses are authoritative for the user's legal-dong definition.
// Use geometry only when the address is insufficient, never the building name.
// This is a display classification; imported source region values stay in the DB.
export function regionForBuilding(
  b: Pick<
    Building,
    "address" | "standard_address" | "latitude" | "longitude" | "region"
  >,
): string {
  const address = (b.standard_address || b.address || "").trim();
  if (/^(?:경기도?\s+)?성남시?\s+분당구(?:\s|$)/.test(address)) return "BBD";
  if (/^서울(?:특별시|시)?\s/.test(address)) {
    if (/\s(?:종로구|중구)(?:\s|$)/.test(address)) return "CBD";
    if (/\s(?:강남구|서초구)(?:\s|$)/.test(address)) return "GBD";
    if (/\s송파구\s(?:신천동|잠실동)(?:\s|$)/.test(address)) return "GBD";
    if (/\s영등포구\s여의도동(?:\s|$)/.test(address)) return "YBD";
    if (/\s\S+동(?:\s|$)/.test(address)) return "Others";
    // A road address can omit the legal dong; use coordinates before Others.
    if (typeof b.longitude === "number" && typeof b.latitude === "number")
      return districtAt(b.longitude, b.latitude) || "Others";
  }
  if (typeof b.longitude === "number" && typeof b.latitude === "number") {
    const district = districtAt(b.longitude, b.latitude);
    if (district) return district;
  }
  return b.region;
}
