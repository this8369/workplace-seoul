import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mapMarkerFacts,
  markerNocIndex,
  markerDevelopmentIndex,
} from "./map-marker-facts.ts";
import type { Building } from "./domain.ts";
import type { Leasing, Development } from "./catalog.ts";
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
    ["계획 연면적", "NOC", "기준층 임대면적", "기준층 전용면적", "준공년도"],
  );
  assert.equal(empty[0].value, "12,100평");
  assert.deepEqual(
    empty.slice(1).map((f) => f.value),
    ["미확인", "미확인", "미확인", "미확인"],
  );
  const actual = mapMarkerFacts(
    {
      ...b,
      area_basis: "actual",
      typical_floor_rentable_pyeong: 850.5,
      typical_floor_exclusive_pyeong: 510.3,
      completion_year: 2019,
    },
    { value: 245000, period: "2025.4Q", basis: "면적·부가세 미확인" },
  );
  assert.equal(actual[1].value, "24.5만원/평");
  assert.equal(actual[1].note, "2025.4Q");
  assert.equal(actual[2].value, "850.5평");
  assert.equal(actual[3].value, "510.3평");
  assert.equal(actual[4].value, "2019년");
});

test("development bubbles use owner/developer and contractor, never operating metrics or legacy floor guesses", () => {
  const b = {
    status: "development",
    area_basis: "planned",
    gross_area_m2: 40000,
    typical_floor_area_pyeong: 999,
  } as Building;
  const facts = mapMarkerFacts(
    b,
    { value: 100000, period: "2025.4Q", basis: "" },
    { developer: "테스트 소유주", contractor: "테스트 시공사", source: "원본" },
  );
  assert.deepEqual(
    facts.map((f) => f.label),
    ["계획 연면적", "소유주·시행주체", "기준층 임대면적", "시공사", "준공년도"],
  );
  assert.equal(facts[1].value, "테스트 소유주");
  assert.equal(facts[2].value, "미확인");
  assert.equal(facts[3].value, "테스트 시공사");
  assert.equal(mapMarkerFacts(b)[1].value, "미확인");
});
test("development facts use the latest source date without silently choosing conflicting parties", () => {
  const rows = [
    { building_id: "a", as_of: "2025", developer: "과거", contractor: "과거" },
    {
      building_id: "a",
      as_of: "2026",
      developer: "현재",
      contractor: "시공사A",
    },
    {
      building_id: "a",
      as_of: "2026",
      developer: "현재",
      contractor: "시공사B",
    },
  ] as Development[];
  const current = markerDevelopmentIndex(rows).get("a");
  assert.equal(current?.developer, "현재");
  assert.equal(current?.contractor, "");
});
