import type { Building } from "./domain.ts";
import type { MarkerNoc } from "./map-marker-facts.ts";
export type BuildingComplex = {
  id: string;
  name: string;
  representative_building_id: string;
  gross_area_m2: number;
  area_method: "aggregate_record" | "sum_components";
};
export type BuildingTower = {
  id: string;
  complex_id: string;
  building_id: string | null;
  label: string;
  sort_order: number;
  typical_floor_rentable_pyeong: number | null;
  typical_floor_exclusive_pyeong: number | null;
  source_url: string | null;
  source_period: string | null;
  collected_at: string | null;
};
export type MapBuilding = Building & { member_ids?: string[] };

// Preserve source records and IDs for favorites, trades and tenant histories.
// Only the map projection combines physical towers into one named complex.
export function complexMapBuildings(
  buildings: Building[],
  complexes: BuildingComplex[],
): MapBuilding[] {
  const metadata = new Map(complexes.map((c) => [c.id, c]));
  const grouped = new Map<string, Building[]>();
  const result: MapBuilding[] = [];
  for (const b of buildings) {
    if (b.complex_id && metadata.has(b.complex_id))
      grouped.set(b.complex_id, [...(grouped.get(b.complex_id) || []), b]);
    else result.push(b);
  }
  for (const [id, members] of grouped) {
    const complex = metadata.get(id)!;
    const representative =
      members.find((b) => b.id === complex.representative_building_id) ||
      members[0];
    result.push({
      ...representative,
      name: complex.name,
      gross_area_m2: complex.gross_area_m2,
      typical_floor_scope: null,
      member_ids: members.map((b) => b.id),
    });
  }
  return result;
}
export const towersFor = (building: Building, towers: BuildingTower[]) =>
  building.complex_id
    ? towers
        .filter((t) => t.complex_id === building.complex_id)
        .sort((a, b) => a.sort_order - b.sort_order)
    : [];

export function towerFloorText(
  towers: BuildingTower[],
  kind: "rentable" | "exclusive",
) {
  return towers
    .map((t) => {
      const n =
        t[
          kind === "rentable"
            ? "typical_floor_rentable_pyeong"
            : "typical_floor_exclusive_pyeong"
        ];
      return `${t.label} ${n != null && n > 0 ? n.toLocaleString("ko-KR", { maximumFractionDigits: 1 }) + "평" : "미확인"}`;
    })
    .join(" / ");
}
export function towerNocFact(
  building: MapBuilding,
  towers: BuildingTower[],
  index: Map<string, MarkerNoc>,
) {
  const values = towers.map((t) =>
    t.building_id ? index.get(t.building_id) : undefined,
  );
  // All physical towers must have independently linked, comparable observations.
  if (
    values.every((v) => v?.value != null) &&
    new Set(values.map((v) => v!.period)).size === 1 &&
    new Set(values.map((v) => v!.basis)).size === 1
  )
    return {
      label: "NOC",
      note: values[0]!.period,
      value:
        towers
          .map(
            (t, i) =>
              `${t.label} ${(values[i]!.value! / 10000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}`,
          )
          .join(" / ") + "만원/평",
      title: values[0]!.basis,
    };
  const observations = (building.member_ids || [building.id])
    .map((id) => index.get(id))
    .filter((v): v is MarkerNoc => Boolean(v));
  if (
    observations.length &&
    observations.every(
      (v) =>
        v.value != null &&
        v.value === observations[0].value &&
        v.period === observations[0].period &&
        v.basis === observations[0].basis,
    )
  )
    return {
      label: "NOC",
      note: observations[0].period,
      value:
        (observations[0].value! / 10000).toLocaleString("ko-KR", {
          maximumFractionDigits: 1,
        }) + "만원/평",
      title: "기존 자산 기준 자료 · 동별 NOC 미확인",
    };
  return {
    label: "NOC",
    value: "동별 자료 확인 중",
    title: "동 구분이 확인되지 않은 NOC를 임의로 배분하지 않습니다.",
  };
}
