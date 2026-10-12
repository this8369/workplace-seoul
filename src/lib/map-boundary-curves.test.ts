import { test } from "node:test";
import assert from "node:assert/strict";
import { roundedBoundaryRing } from "./map-boundary-curves.ts";

test("rounded boundaries stay closed, local and consistent with reversed mask holes", () => {
  const ring: [number, number][] = [[127, 37.5], [127.01, 37.5], [127.01, 37.51], [127, 37.51], [127, 37.5]];
  const before = structuredClone(ring);
  const rounded = roundedBoundaryRing(ring);
  assert.deepEqual(rounded[0], rounded.at(-1));
  assert.deepEqual(ring, before);
  assert.ok(rounded.every(([x, y]) => x >= 127 && x <= 127.01 && y >= 37.5 && y <= 37.51));
  assert.ok(rounded.every(([x, y]) => ring.some(([a, b]) => Math.hypot((x-a)*88000, (y-b)*111320) <= 46)));
  const keys = (points: [number, number][]) => [...new Set(points.map(p => p.map(x => x.toFixed(9)).join(',')))].sort();
  assert.deepEqual(keys(rounded), keys(roundedBoundaryRing([...ring].reverse())));
});
