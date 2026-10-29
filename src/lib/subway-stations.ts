import catalog from "../data/subway-stations.json" with { type: "json" };

export type StationLocation = {
  latitude: number | null;
  longitude: number | null;
};
type Station = { name: string; line: string } & StationLocation;
export const stationSource = {
  source_name: catalog.source_name,
  source_url: catalog.source_url,
  as_of: catalog.as_of,
};
export function stationName(value: string) {
  return value
    .replace(/\([^)]*\)/g, "")
    .replace(/지하철역/g, "역")
    .replace(/\s/g, "")
    .replace(/역$/, "");
}
const stations: Station[] = catalog.stations.map(
  ([name, line, latitude, longitude]) => ({
    name: stationName(String(name)),
    line: String(line),
    latitude: Number(latitude),
    longitude: Number(longitude),
  }),
);
const byName = new Map<string, Station[]>();
for (const station of stations) {
  const entries = byName.get(station.name) || [];
  entries.push(station);
  byName.set(station.name, entries);
}
function located(
  point?: StationLocation,
): point is { latitude: number; longitude: number } {
  return (
    point?.latitude != null &&
    point.longitude != null &&
    Number.isFinite(Number(point.latitude)) &&
    Number.isFinite(Number(point.longitude))
  );
}
function distance(a: StationLocation, b: StationLocation) {
  const rad = Math.PI / 180;
  const dlat = (Number(a.latitude) - Number(b.latitude)) * rad;
  const dlon = (Number(a.longitude) - Number(b.longitude)) * rad;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(Number(a.latitude) * rad) *
      Math.cos(Number(b.latitude) * rad) *
      Math.sin(dlon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
export function stationLines(
  name: string,
  location?: StationLocation,
  maxDistance = 1000,
): string[] {
  let matches = byName.get(stationName(name)) || [];
  if (!matches.length) return [];
  if (located(location)) {
    matches = matches
      .filter((s) => distance(s, location) <= maxDistance)
      .sort((a, b) => distance(a, location) - distance(b, location));
  }
  const first = matches[0];
  if (!first) return [];
  // Identical names do not necessarily identify a transfer station (e.g. Yangpyeong).
  if (!located(location) && matches.some((s) => distance(s, first) > 500))
    return [];
  return [
    ...new Set(
      matches.filter((s) => distance(s, first) <= 500).map((s) => s.line),
    ),
  ].sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));
}
export function stationNameOptions(location?: StationLocation) {
  return [
    ...new Set(
      stations
        .filter((s) => !located(location) || distance(s, location) <= 10000)
        .map((s) => `${s.name}역`),
    ),
  ];
}
