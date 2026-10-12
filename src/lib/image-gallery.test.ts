import { test } from "node:test";
import assert from "node:assert/strict";
import { adjacentImageId } from "./image-gallery.ts";
test("gallery navigation preserves display order and wraps in both directions", () => {
  const images = [{ id: "front" }, { id: "lobby" }, { id: "floor" }];
  assert.equal(adjacentImageId(images, "front", 1), "lobby");
  assert.equal(adjacentImageId(images, "floor", 1), "front");
  assert.equal(adjacentImageId(images, "front", -1), "floor");
  assert.equal(adjacentImageId([], undefined, 1), undefined);
  assert.equal(adjacentImageId([{ id: "only" }], "only", -1), "only");
  assert.equal(adjacentImageId(images, "removed", 1), "lobby");
});
