import type { Building } from "./domain.ts";
import { hasLocation } from "./map-clusters.ts";

export type MapBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};
export type BuildingSort = "area-desc" | "area-asc" | "year-desc" | "year-asc";

export function visibleBuildings(
  buildings: Building[],
  bounds: MapBounds | null,
) {
  if (!bounds) return [];
  return buildings.filter(
    (b) =>
      hasLocation(b) &&
      b.latitude >= bounds.south &&
      b.latitude <= bounds.north &&
      (bounds.west <= bounds.east
        ? b.longitude >= bounds.west && b.longitude <= bounds.east
        : b.longitude >= bounds.west || b.longitude <= bounds.east),
  );
}

export function sortBuildings(
  buildings: Building[],
  sort: BuildingSort,
  developmentYears: ReadonlyMap<string, number | null> = new Map(),
) {
  const year = (b: Building) =>
    b.status === "development"
      ? (developmentYears.get(b.id) ?? null)
      : b.completion_year;
  const value = (b: Building) =>
    sort.startsWith("area-") ? b.gross_area_m2 : year(b);
  return [...buildings].sort((a, b) => {
    const av = value(a),
      bv = value(b);
    const aKnown = av != null && Number.isFinite(av) && av > 0;
    const bKnown = bv != null && Number.isFinite(bv) && bv > 0;
    if (aKnown !== bKnown) return aKnown ? -1 : 1;
    const diff =
      aKnown && bKnown ? (av! - bv!) * (sort.endsWith("desc") ? -1 : 1) : 0;
    return (
      diff ||
      a.name.localeCompare(b.name, "ko", { numeric: true }) ||
      a.id.localeCompare(b.id)
    );
  });
}
