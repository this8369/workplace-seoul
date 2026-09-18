import type { Building } from "./domain.ts";
export const districts = [
  {
    key: "CBD",
    label: "CBD",
    name: "도심",
    latitude: 37.57,
    longitude: 126.986,
  },
  {
    key: "GBD",
    label: "GBD",
    name: "강남",
    latitude: 37.506,
    longitude: 127.044,
  },
  {
    key: "YBD",
    label: "YBD",
    name: "여의도",
    latitude: 37.524,
    longitude: 126.925,
  },
  {
    key: "Others",
    label: "서울 기타",
    name: "서울 기타",
    latitude: 37.559,
    longitude: 126.865,
  },
  {
    key: "BBD",
    label: "BBD",
    name: "분당·판교",
    latitude: 37.399,
    longitude: 127.111,
  },
] as const;
export function hasLocation(
  b: Building,
): b is Building & { latitude: number; longitude: number } {
  return (
    typeof b.latitude === "number" &&
    typeof b.longitude === "number" &&
    Number.isFinite(b.latitude) &&
    Number.isFinite(b.longitude) &&
    b.latitude >= 33 &&
    b.latitude <= 39 &&
    b.longitude >= 124 &&
    b.longitude <= 132
  );
}
export type MapGroup = {
  id: string;
  label?: string;
  latitude: number;
  longitude: number;
  buildings: Building[];
};
export function districtGroups(buildings: Building[]): MapGroup[] {
  return districts
    .map((d) => ({
      id: d.key,
      label: d.label,
      latitude: d.latitude,
      longitude: d.longitude,
      buildings: buildings.filter((b) => b.region === d.key),
    }))
    .filter((d) => d.buildings.length);
}
function pixels(latitude: number, longitude: number, zoom: number) {
  const size = 256 * 2 ** zoom,
    sin = Math.sin((latitude * Math.PI) / 180);
  return {
    x: ((longitude + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  };
}
// Deterministic grouping within a pixel radius. Duplicate coordinates remain grouped
// at maximum zoom, so every tower/record can be selected without invented locations.
export function spatialGroups(buildings: Building[], zoom: number): MapGroup[] {
  const radius = zoom < 16 ? 64 : zoom < 18 ? 32 : 18;
  const groups: (MapGroup & { x: number; y: number })[] = [];
  for (const b of buildings
    .filter(hasLocation)
    .sort((a, b) => a.id.localeCompare(b.id))) {
    const p = pixels(b.latitude, b.longitude, zoom);
    const group = groups.find(
      (g) => Math.hypot(g.x - p.x, g.y - p.y) <= radius,
    );
    if (group) {
      const n = group.buildings.length;
      group.latitude = (group.latitude * n + b.latitude) / (n + 1);
      group.longitude = (group.longitude * n + b.longitude) / (n + 1);
      group.buildings.push(b);
    } else
      groups.push({
        id: b.id,
        latitude: b.latitude,
        longitude: b.longitude,
        buildings: [b],
        ...p,
      });
  }
  return groups;
}
