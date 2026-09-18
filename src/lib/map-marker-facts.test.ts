import { test } from "node:test";
import assert from "node:assert/strict";
import { mapMarkerFacts, markerNocIndex } from "./map-marker-facts.ts";
import type { Building } from "./domain.ts";
import type { Leasing } from "./catalog.ts";
const lease = (
  building_id: string,
  period: string,
  noc: number | null,
  area_basis = "면적 기준 미확인",
) =>
  ({
    building_id,
    period,
    noc,
    area_basis,
    vat_basis: "부가세 미확인",
  }) as Leasing;
test("marker NOC never substitutes older quarters or conflicting duplicate values", () => {
  const index = markerNocIndex([
    lease("old", "2025.3Q", 200000),
    lease("valid", "2025.4Q", 230000),
    lease("valid", "2025.4Q", 230000),
    lease("conflict", "2025.4Q", 180000),
    lease("conflict", "2025.4Q", 190000),
    lease("basis", "2025.4Q", 150000),
    lease("basis", "2025.4Q", 150000, "전용면적"),
    lease("zero", "2025.4Q", 0),
    lease("invalid", "unknown", 400000),
  ]);
  assert.equal(index.has("old"), false);
  assert.equal(index.has("invalid"), false);
  assert.equal(index.get("valid")?.value, 230000);
  for (const id of ["conflict", "basis", "zero"])
    assert.equal(index.get(id)?.value, null);
});
test("bubble facts distinguish planned area and absent data without estimating floor area", () => {
  const b = {
    gross_area_m2: 40000,
    area_basis: "planned",
    completion_year: null,
    floors_above: 20,
  } as Building;
  const empty = mapMarkerFacts(b);
  assert.deepEqual(
    empty.map((f) => f.label),
    ["계획 연면적", "NOC", "기준층 면적", "준공년도"],
  );
  assert.equal(empty[0].value, "12,100평");
  assert.deepEqual(
    empty.slice(1).map((f) => f.value),
    ["미확인", "미확인", "미확인"],
  );
  const actual = mapMarkerFacts(
    {
      ...b,
      area_basis: "actual",
      typical_floor_area_pyeong: 850.5,
      completion_year: 2019,
    },
    { value: 245000, period: "2025.4Q", basis: "면적·부가세 미확인" },
  );
  assert.equal(actual[1].value, "24.5만원/평");
  assert.equal(actual[1].note, "2025.4Q");
  assert.equal(actual[2].value, "850.5평");
  assert.equal(actual[3].value, "2019년");
});
