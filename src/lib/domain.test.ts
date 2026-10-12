import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isEligible,
  toPyeong,
  filterBuildings,
  safeSourceUrl,
  type Building,
} from "./domain.ts";
test("unrounded gross area threshold", () => {
  assert.equal(isEligible(33057.85), false);
  assert.equal(isEligible(4000000 / 121), true);
  assert.equal(isEligible(33057.86), true);
  assert.equal(isEligible(NaN), false);
  assert.equal(toPyeong(400), 121);
});
test("combined search and favorites", () => {
  const b = {
    id: "a",
    name: "테스트 오피스",
    address: "서울",
    region: "CBD",
    status: "operating",
    gross_area_m2: 40000,
  } as Building;
  assert.equal(
    filterBuildings([b], " 테스트 ", "CBD", "operating", new Set(["a"])).length,
    1,
  );
  assert.equal(filterBuildings([b], "", "GBD", "").length, 0);
  assert.equal(filterBuildings([b], "", "", "", new Set()).length, 0);
  assert.equal(
    filterBuildings([{ ...b, gross_area_m2: 33057.85 }], "", "", "").length,
    0,
  );
});
test("safe source links", () => {
  assert.equal(safeSourceUrl("javascript:alert(1)"), undefined);
  assert.equal(safeSourceUrl("https://example.com"), "https://example.com/");
});

test("IGIS discovery is public, size-exempt and office-only outside IGIS mode", () => {
  const base = {
    id: "base",
    name: "Building",
    address: "Seoul",
    region: "CBD",
    status: "operating",
    gross_area_m2: 1000,
  } as Building;
  const office = {
    ...base,
    id: "office",
    is_igis: true,
    asset_category: "office" as const,
  };
  const hotel = { ...office, id: "hotel", asset_category: "hotel" as const };
  const unknown = { ...office, id: "unknown", gross_area_m2: null };
  const big = { ...base, id: "big", gross_area_m2: 40000 };
  assert.deepEqual(
    filterBuildings([base, office, hotel, unknown, big], "", "", "").map(
      (b) => b.id,
    ),
    ["office", "unknown", "big"],
  );
  assert.deepEqual(
    filterBuildings(
      [base, office, hotel, unknown, big],
      "",
      "",
      "",
      undefined,
      true,
    ).map((b) => b.id),
    ["office", "hotel", "unknown"],
  );
  assert.deepEqual(
    filterBuildings([office, hotel], "", "", "", undefined, true, "hotel").map(
      (b) => b.id,
    ),
    ["hotel"],
  );
  assert.equal(isEligible(null), false);
});

test("mixed-use assets remain in their primary category and appear once in the mixed filter", () => {
  const base = { id: "office", name: "복합오피스", address: "서울", region: "GBD", status: "operating", gross_area_m2: 1000, is_igis: true, asset_category: "office", is_mixed_use: true } as Building;
  const hotel = { ...base, id: "hotel", asset_category: "hotel" as const };
  const ordinary = { ...base, id: "ordinary", is_mixed_use: false };
  const standaloneMixed = { ...base, id: "mixed", asset_category: "mixed" as const, is_mixed_use: undefined };
  const rows = [base, hotel, ordinary, standaloneMixed];
  const ids = (category: string) => filterBuildings(rows, "", "", "", undefined, true, category).map(b => b.id);
  assert.deepEqual(ids("mixed"), ["office", "hotel", "mixed"]);
  assert.deepEqual(ids("office"), ["office", "ordinary"]);
  assert.deepEqual(ids("hotel"), ["hotel"]);
  assert.deepEqual(ids(""), ["office", "hotel", "ordinary", "mixed"]);
  assert.deepEqual(filterBuildings(rows, "", "", "").map(b => b.id), ["office", "ordinary"]);
  assert.equal(filterBuildings(rows, "", "CBD", "", undefined, true, "mixed").length, 0);
  assert.equal(filterBuildings(rows, "", "", "development", undefined, true, "mixed").length, 0);
});
