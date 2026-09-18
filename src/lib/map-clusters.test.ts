import { test } from "node:test";
import assert from "node:assert/strict";
import { spatialGroups, districtGroups, hasLocation } from "./map-clusters.ts";
import type { Building } from "./domain.ts";
const building = (
  id: string,
  latitude: number | null,
  longitude: number | null,
  region = "CBD",
) => ({ id, latitude, longitude, region }) as Building;
test("clusters conserve every valid ID, exclude unknown coordinates and are order independent", () => {
  const input = [
    building("c", 37.57, 126.98),
    building("a", 37.5702, 126.9802),
    building("b", 37.51, 127.05),
    building("missing", null, null),
    building("bad", NaN, 127),
  ];
  for (const zoom of [13, 14, 16, 18, 21]) {
    const groups = spatialGroups(input, zoom);
    assert.deepEqual(
      groups.flatMap((g) => g.buildings.map((b) => b.id)).sort(),
      ["a", "b", "c"],
    );
    assert.deepEqual(groups, spatialGroups([...input].reverse(), zoom));
  }
  assert.equal(input.filter(hasLocation).length, 3);
});
test("nearby buildings separate at high zoom; collocated buildings remain selectable as separate records", () => {
  const input = [
    building("a", 37.57, 126.98),
    building("b", 37.5702, 126.9802),
    building("c", 37.57, 126.98),
  ];
  assert.equal(spatialGroups(input, 13).length, 1);
  const zoomed = spatialGroups(input, 21);
  assert.equal(zoomed.length, 2);
  assert.deepEqual(
    zoomed.find((g) => g.buildings.length === 2)?.buildings.map((b) => b.id),
    ["a", "c"],
  );
});
test("overview counts all source assets without assigning fake building coordinates", () => {
  const groups = districtGroups([
    building("a", 37.57, 126.98),
    building("b", null, null, "Others"),
    building("c", 37.4, 127.1, "BBD"),
  ]);
  assert.deepEqual(
    groups.map((g) => [g.id, g.buildings.length]),
    [
      ["CBD", 1],
      ["Others", 1],
      ["BBD", 1],
    ],
  );
  assert.equal(
    spatialGroups(
      groups.flatMap((g) => g.buildings),
      14,
    ).flatMap((g) => g.buildings).length,
    2,
  );
});
