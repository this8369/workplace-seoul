import { test } from "node:test";
import assert from "node:assert/strict";
import { imageEditPatch, keepPrimaryOnPublish } from "./image-edit.ts";
import type { BuildingImage } from "./building-images.ts";
const original = {
  title: "타워",
  kind: "photo",
  source_name: "출처",
  source_url: null,
  captured_on: null,
  credit: "",
  license_name: "",
  rights_status: "unconfirmed",
  rights_note: "",
  review_note: "",
  focal_x: 50,
  focal_y: 50,
  zoom_percent: 100,
  is_primary: true,
  review_status: "approved",
} as BuildingImage;
test("crop and zoom updates leave approval and representative thumbnail intact", () => {
  assert.deepEqual(
    imageEditPatch(original, { ...original, focal_y: 70, zoom_percent: 120 }),
    { focal_y: 70, zoom_percent: 120 },
  );
  assert.deepEqual(imageEditPatch(original, original), {});
  assert.equal(keepPrimaryOnPublish(original, original), true);
  assert.equal(
    keepPrimaryOnPublish({ ...original, is_primary: false }, original),
    false,
  );
});
test("replacement, identity and floor plan changes still require review", () => {
  for (const patch of [
    imageEditPatch(original, original, true),
    imageEditPatch(original, { ...original, title: "다른 건물" }),
    imageEditPatch(original, { ...original, kind: "floor_plan" }),
  ]) {
    assert.equal(patch.review_status, "candidate");
    assert.equal(patch.is_primary, false);
  }
  assert.equal(
    keepPrimaryOnPublish(original, { ...original, kind: "floor_plan" }),
    false,
  );
});
