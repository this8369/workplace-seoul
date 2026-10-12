import assert from "node:assert/strict";
import { test } from "node:test";
import { activeSectionIndex } from "./scroll-section.ts";

test("scroll selection follows headings below the sticky menu in both directions", () => {
  assert.equal(activeSectionIndex([300, 800, 1200], 64), 0);
  assert.equal(activeSectionIndex([-500, 64, 450], 64), 1);
  assert.equal(activeSectionIndex([-800, -300, 40], 64), 2);
  assert.equal(activeSectionIndex([-200, 100, 500], 64), 0);
});
test("a short last section becomes selected at the bottom of the page", () => {
  assert.equal(activeSectionIndex([-800, -300, 250], 64, true), 2);
  assert.equal(activeSectionIndex([], 64, true), -1);
});
