import type { ParcelGeometry } from "./asset-context";

/** Preserve each polygon's interior rings (holes), reject malformed coordinates. */
export function parcelPolygons(
  geometry: ParcelGeometry | null,
): number[][][][] {
  if (!geometry) return [];
  const polygons =
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates
        : [];
  if (!Array.isArray(polygons)) return [];
  return polygons.filter(
    (polygon) =>
      Array.isArray(polygon) &&
      polygon.length > 0 &&
      polygon.every(
        (ring) =>
          Array.isArray(ring) &&
          ring.length >= 4 &&
          ring.every(
            (point) =>
              Array.isArray(point) &&
              point.length >= 2 &&
              Number.isFinite(point[0]) &&
              Number.isFinite(point[1]) &&
              Math.abs(point[0]) <= 180 &&
              Math.abs(point[1]) <= 90,
          ) &&
          ring[0][0] === ring.at(-1)![0] &&
          ring[0][1] === ring.at(-1)![1],
      ),
  );
}
