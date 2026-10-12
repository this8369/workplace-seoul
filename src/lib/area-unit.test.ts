import { test } from "node:test";
import assert from "node:assert/strict";
import { areaText, convertArea, pricePerArea } from "./area-unit.ts";

test("area and per-area prices convert in opposite directions without changing source values", () => {
  assert.equal(convertArea(400, "m²", "평"), 121);
  assert.equal(convertArea(121, "평", "m²"), 400);
  assert.equal(convertArea(400, "m²", "m²"), 400);
  assert.equal(pricePerArea(40000, "평", "m²"), 12100);
  assert.equal(pricePerArea(12100, "m²", "평"), 40000);
  assert.equal(areaText(463204.1, "m²", "평", 0), "140,119평");
  assert.equal(areaText(463204.1, "m²", "m²"), "463,204.1m²");
});

test("missing areas stay unknown and zero remains a valid measurement", () => {
  for (const value of [null, undefined, NaN, Infinity])
    assert.equal(areaText(value, "m²", "평"), "미확인");
  assert.equal(areaText(0, "m²", "평"), "0평");
  assert.equal(pricePerArea(null, "평", "m²"), null);
});
