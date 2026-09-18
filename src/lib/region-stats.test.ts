import { test } from "node:test";
import assert from "node:assert/strict";
import { regionStats } from "./region-stats.ts";
import type { Building } from "./domain.ts";
import type { Leasing } from "./catalog.ts";
const building = (id: string, region = "CBD") =>
  ({ id, region, gross_area_m2: 40000, area_basis: "actual" }) as Building;
const lease = (id: string, noc: number | null, period = "2025.4Q") =>
  ({
    building_id: id,
    noc,
    period,
    area_basis: "면적 기준 미확인",
    vat_basis: "부가세 미확인",
  }) as Leasing;
test("region NOC uses one latest quarter, one value per building, and excludes missing/conflicting values", () => {
  const a = building("a"),
    b = building("b"),
    c = building("c"),
    d = building("d");
  const result = regionStats(
    [a, a, b, c, d, building("outside", "GBD")],
    [
      lease("a", 100000),
      lease("a", 100000),
      lease("a", 90000, "2025.3Q"),
      lease("b", 200000),
      lease("c", null),
      lease("c", 300000, "2025.3Q"),
      lease("d", 120000),
      lease("d", 130000),
      lease("outside", 500000),
    ],
    "CBD",
  );
  assert.equal(result.count, 4);
  assert.equal(result.area, 160000);
  assert.equal(result.samples, 2);
  assert.equal(result.average, 150000);
  assert.equal(result.highest, 200000);
  assert.equal(result.lowest, 100000);
  assert.equal(result.period, "2025.4Q");
});
test("a region without current NOC stays missing rather than using earlier quarters or zeros", () => {
  const result = regionStats(
    [building("a")],
    [lease("a", 120000, "2025.3Q"), lease("outside", 200000, "2025.4Q")],
    "CBD",
  );
  assert.equal(result.samples, 0);
  assert.equal(result.average, null);
  assert.equal(result.highest, null);
  assert.equal(result.lowest, null);
  assert.equal(regionStats([], [], "CBD").period, null);
  for (const value of [0, -1, NaN, Infinity, null])
    assert.equal(
      regionStats([building("a")], [lease("a", value)], "CBD").samples,
      0,
    );
});
