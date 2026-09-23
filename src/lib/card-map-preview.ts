import type { MapBuilding } from "./building-towers.ts";
import { hasLocation, spatialGroups, type MapGroup } from "./map-clusters.ts";

export function cardPreviewBuilding(
  buildings: MapBuilding[],
  id: string | null,
) {
  if (!id) return null;
  const building = buildings.find(
    (b) => b.id === id || b.member_ids?.includes(id),
  );
  return building && hasLocation(building) ? building : null;
}

export function cardPreviewGroups(
  buildings: MapBuilding[],
  zoom: number,
  id: string | null,
): MapGroup[] {
  const preview = cardPreviewBuilding(buildings, id);
  const groups = spatialGroups(
    buildings.filter((b) => b.id !== preview?.id),
    zoom,
  );
  if (preview)
    groups.push({
      id: preview.id,
      latitude: preview.latitude,
      longitude: preview.longitude,
      buildings: [preview],
    });
  return groups;
}
