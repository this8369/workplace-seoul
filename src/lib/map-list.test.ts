import { test } from "node:test";
import assert from "node:assert/strict";
import { visibleBuildings, sortBuildings, type MapBounds } from "./map-list.ts";
import type { Building } from "./domain.ts";
const b = (id: string, overrides: Partial<Building> = {}) =>
  ({
    id,
    name: id,
    latitude: 37.55,
    longitude: 126.98,
    status: "operating",
    gross_area_m2: 50000,
    completion_year: 2000,
    ...overrides,
  }) as Building;
const bounds: MapBounds = { south: 37.5, north: 37.6, west: 126.9, east: 127 };
test("viewport cards include boundary points, exclude outside and unknown coordinates, and recover after panning", () => {
  const rows = [
    b("center"),
    b("edge", { latitude: 37.6, longitude: 127 }),
    b("outside", { longitude: 127.2 }),
    b("unknown", { latitude: null }),
  ];
  assert.deepEqual(
    visibleBuildings(rows, bounds).map((b) => b.id),
    ["center", "edge"],
  );
  assert.deepEqual(
    visibleBuildings(rows, { ...bounds, west: 127.1, east: 127.3 }).map(
      (b) => b.id,
    ),
    ["outside"],
  );
  assert.deepEqual(
    visibleBuildings(rows, bounds).map((b) => b.id),
    ["center", "edge"],
  );
  assert.deepEqual(visibleBuildings(rows, null), []);
});
test("all four sorts are deterministic and leave source order unchanged; missing years are always last", () => {
  const rows = [
    b("unknown", { completion_year: null, gross_area_m2: 80000 }),
    b("old", { completion_year: 1990, gross_area_m2: 40000 }),
    b("new", { completion_year: 2020, gross_area_m2: 60000 }),
  ];
  const ids = (sort: Parameters<typeof sortBuildings>[1]) =>
    sortBuildings(rows, sort).map((b) => b.id);
  assert.deepEqual(ids("area-desc"), ["unknown", "new", "old"]);
  assert.deepEqual(ids("area-asc"), ["old", "new", "unknown"]);
  assert.deepEqual(ids("year-desc"), ["new", "old", "unknown"]);
  assert.deepEqual(ids("year-asc"), ["old", "new", "unknown"]);
  assert.deepEqual(
    rows.map((b) => b.id),
    ["unknown", "old", "new"],
  );
});
test("development year sorting uses reviewed planned years, leaving undated projects last", () => {
  const rows = [
    b("built", { completion_year: 2024 }),
    b("planned", { status: "development", completion_year: 1990 }),
    b("undated", { status: "development", completion_year: 1980 }),
  ];
  const years = new Map([
    ["planned", 2028],
    ["undated", null],
  ]);
  assert.deepEqual(
    sortBuildings(rows, "year-desc", years).map((b) => b.id),
    ["planned", "built", "undated"],
  );
  assert.deepEqual(
    sortBuildings(rows, "year-asc", years).map((b) => b.id),
    ["built", "planned", "undated"],
  );
});
