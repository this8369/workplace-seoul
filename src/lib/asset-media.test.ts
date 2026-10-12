import assert from "node:assert/strict";
import { test } from "node:test";
import { bearingToBuilding, mediaLayerLeft } from "./asset-media.ts";

test("street camera points toward the building in all four directions", () => {
  assert.equal(bearingToBuilding(37.5, 127, 37.51, 127), 0);
  assert.equal(Math.abs(bearingToBuilding(37.5, 127, 37.49, 127)), 180);
  assert.ok(Math.abs(bearingToBuilding(37.5, 127, 37.5, 127.01) - 90) < 0.01);
  assert.ok(Math.abs(bearingToBuilding(37.5, 127, 37.5, 126.99) + 90) < 0.01);
});

test("media opens beside detail when enough map space remains", () => {
  assert.equal(mediaLayerLeft(1200, 455), 470);
  assert.equal(mediaLayerLeft(800, 450), 460);
});

test("narrow maps use an overlay instead of an unusably narrow viewer", () => {
  assert.equal(mediaLayerLeft(700, 448.75), 8.75);
  assert.equal(mediaLayerLeft(375, 375), 4.6875);
});
