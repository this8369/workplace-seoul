import { test } from "node:test";
import assert from "node:assert/strict";
import {
  complexMapBuildings,
  towerFloorText,
  towerNocFact,
  type BuildingComplex,
  type BuildingTower,
} from "./building-towers.ts";
import { mapMarkerFacts } from "./map-marker-facts.ts";
import type { Building } from "./domain.ts";
const a = {
  id: "a",
  name: "A동",
  complex_id: "c",
  gross_area_m2: 50000,
  status: "operating",
  area_basis: "actual",
  latitude: 37.5,
  longitude: 127,
} as Building;
const b = { ...a, id: "b", name: "B동", gross_area_m2: 60000 };
const c: BuildingComplex = {
  id: "c",
  name: "단지",
  representative_building_id: "a",
  gross_area_m2: 110000,
  area_method: "sum_components",
};
const towers = [
  {
    id: "ta",
    complex_id: "c",
    building_id: "a",
    label: "A동",
    sort_order: 0,
    typical_floor_rentable_pyeong: 800,
    typical_floor_exclusive_pyeong: 400,
  },
  {
    id: "tb",
    complex_id: "c",
    building_id: "b",
    label: "B동",
    sort_order: 1,
    typical_floor_rentable_pyeong: 650,
    typical_floor_exclusive_pyeong: 350,
  },
] as BuildingTower[];
test("map combines only reviewed complex members, preserving filtering and original records", () => {
  const extra = { ...a, id: "x", complex_id: null };
  const source = [a, b, extra];
  const projected = complexMapBuildings(source, [c]);
  assert.equal(projected.length, 2);
  const complex = projected.find((x) => x.complex_id === "c")!;
  assert.equal(complex.gross_area_m2, 110000);
  assert.equal(complex.name, "단지");
  assert.deepEqual(complex.member_ids, ["a", "b"]);
  assert.equal(a.name, "A동");
  assert.equal(a.gross_area_m2, 50000);
  assert.equal(complexMapBuildings([b], [c])[0].id, "b");
  assert.equal(complexMapBuildings(source, []).length, 3);
});
test("hover retains distinct tower floor values and honest missing values", () => {
  assert.equal(towerFloorText(towers, "rentable"), "A동 800평 / B동 650평");
  const facts = mapMarkerFacts(a, undefined, undefined, towers);
  assert.equal(
    facts.find((f) => f.label === "기준층 전용면적")?.value,
    "A동 400평 / B동 350평",
  );
  assert.equal(
    towerFloorText(
      [{ ...towers[0], typical_floor_rentable_pyeong: null }],
      "rentable",
    ),
    "A동 미확인",
  );
});
test("NOC is per tower only with verified links and matching observation bases", () => {
  const m = complexMapBuildings([a, b], [c])[0];
  const index = new Map([
    ["a", { period: "2025.4Q", value: 300000, basis: "same" }],
    ["b", { period: "2025.4Q", value: 400000, basis: "same" }],
  ]);
  assert.equal(towerNocFact(m, towers, index).value, "A동 30 / B동 40만원/평");
  assert.equal(
    towerNocFact(
      m,
      towers.map((t) => ({ ...t, building_id: null })),
      index,
    ).value,
    "동별 자료 확인 중",
  );
  assert.equal(
    towerNocFact(
      m,
      towers,
      new Map([
        ["a", index.get("a")!],
        ["b", { ...index.get("b")!, period: "2024.4Q" }],
      ]),
    ).value,
    "동별 자료 확인 중",
  );
});
