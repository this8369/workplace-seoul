import { test } from "node:test";
import assert from "node:assert/strict";
import {
  complexMapBuildings,
  towerFloorText,
  buildingFloorText,
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
test("list cards show known tower floors without inventing a complex-wide area", () => {
  assert.equal(
    buildingFloorText({ ...a, id: "complex" }, towers),
    "A동 400평 / B동 350평",
  );
  assert.equal(buildingFloorText(a, towers), "A동 400평");
  assert.equal(
    buildingFloorText({ ...a, typical_floor_exclusive_pyeong: 410 }, towers),
    "410평",
  );
  assert.equal(buildingFloorText({ ...a, complex_id: null }, towers), "미확인");
});
test("list floor values truncate decimals while detail and map tower values keep precision", () => {
  assert.equal(
    buildingFloorText(
      { ...a, typical_floor_exclusive_pyeong: 1236.99 },
      towers,
    ),
    "1,236평",
  );
  const precise = [{ ...towers[0], typical_floor_exclusive_pyeong: 400.9 }];
  assert.equal(buildingFloorText(a, precise), "A동 400평");
  assert.equal(towerFloorText(precise, "exclusive"), "A동 400.9평");
  assert.equal(precise[0].typical_floor_exclusive_pyeong, 400.9);
});
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

test("complex list groups keep aliases and child favorites without copying representative metrics", async () => {
  const { filterBuildings } = await import("./domain.ts");
  const member = {
    ...a,
    address: "서울",
    region: "CBD",
    typical_floor_exclusive_pyeong: 999,
    parking_spaces: 50,
  } as Building;
  const grouped = complexMapBuildings(
    [member, { ...b, address: "서울", region: "CBD" }],
    [c],
  );
  assert.equal(grouped[0].typical_floor_exclusive_pyeong, null);
  assert.equal(grouped[0].parking_spaces, null);
  assert.equal(buildingFloorText(grouped[0], towers), "A동 400평 / B동 350평");
  assert.equal(
    filterBuildings(grouped, "B동", "", "", new Set(["b"])).length,
    1,
  );
  assert.equal(
    filterBuildings(grouped, "단지", "", "", new Set(["b"])).length,
    1,
  );
  assert.deepEqual(complexMapBuildings(grouped, [c])[0].member_ids, ["a", "b"]);
});
test("common facilities and physical children do not become comparison choices or floor sums", async () => {
  const { towersFor } = await import("./building-towers.ts");
  const extended: BuildingTower[] = [
    ...towers,
    { ...towers[0], id: "mall", component_kind: "facility" },
    { ...towers[0], id: "child", parent_tower_id: "ta" },
  ];
  assert.deepEqual(
    towersFor(a, extended).map((t) => t.id),
    ["ta", "tb"],
  );
});

test("complex list reuses linked building floor observations without copying or summing them", () => {
  const members = [
    { ...a, typical_floor_exclusive_pyeong: 1146.9 },
    { ...b, typical_floor_exclusive_pyeong: 427.7 },
  ];
  const missing = towers.map((t) => ({
    ...t,
    typical_floor_exclusive_pyeong: null,
  }));
  const projected = complexMapBuildings(members, [c])[0];
  assert.equal(
    buildingFloorText(projected, missing, members),
    "A동 1,146평 / B동 427평",
  );
  assert.equal(missing[0].typical_floor_exclusive_pyeong, null);
  assert.equal(members[0].typical_floor_exclusive_pyeong, 1146.9);
});
