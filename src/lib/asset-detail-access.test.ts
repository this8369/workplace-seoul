import assert from "node:assert/strict";
import test from "node:test";
import { assetDetailTabs, hasIgisDetails } from "./asset-detail-access.ts";

test("IGIS panel follows each building, including mixed complexes", () => {
  const towers = [{ is_igis: true }, { is_igis: false }, {}];
  assert.deepEqual(towers.map(hasIgisDetails), [true, false, false]);
});

test("public detail navigation is independent of the IGIS panel", () => {
  assert.deepEqual(assetDetailTabs(), [
    "개요",
    "시장 임대",
    "임차기업",
    "토지",
    "건축물대장",
    "거래 이력",
    "개발·변경 이력",
    "주변",
  ]);
});
