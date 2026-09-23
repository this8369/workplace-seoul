import { test } from "node:test";
import assert from "node:assert/strict";
import type { MapBuilding } from "./building-towers.ts";
import { cardPreviewBuilding, cardPreviewGroups } from "./card-map-preview.ts";
import { spatialGroups } from "./map-clusters.ts";

const asset = (id: string, extra: Partial<MapBuilding> = {}) =>
  ({ id, latitude: 37.566, longitude: 126.978, ...extra }) as MapBuilding;

test("hovered co-located asset is isolated at the current zoom without dropping neighbors", () => {
  const buildings = [asset("a"), asset("b"), asset("c")];
  for (const zoom of [12, 15, 19, 21]) {
    const groups = cardPreviewGroups(buildings, zoom, "b");
    assert.equal(groups.length, 2);
    assert.deepEqual(
      groups.find((g) => g.id === "b")?.buildings.map((b) => b.id),
      ["b"],
    );
    assert.deepEqual(
      groups.flatMap((g) => g.buildings.map((b) => b.id)).sort(),
      ["a", "b", "c"],
    );
  }
});

test("each tower card resolves to its existing complex bubble", () => {
  const complex = asset("a", { member_ids: ["a", "b"] });
  assert.equal(cardPreviewBuilding([complex], "b"), complex);
  assert.deepEqual(cardPreviewGroups([complex], 15, "b")[0].buildings, [
    complex,
  ]);
});

test("leaving a card restores normal clustering", () => {
  const buildings = [asset("a"), asset("b")];
  assert.deepEqual(
    cardPreviewGroups(buildings, 15, null),
    spatialGroups(buildings, 15),
  );
});

test("missing and invalid coordinates cannot drive a map preview", () => {
  for (const latitude of [null, NaN, 0, 90]) {
    const buildings = [asset("bad", { latitude })];
    assert.equal(cardPreviewBuilding(buildings, "bad"), null);
    assert.deepEqual(cardPreviewGroups(buildings, 15, "bad"), []);
  }
  assert.equal(cardPreviewBuilding([asset("a")], "missing"), null);
});
