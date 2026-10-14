import assert from "node:assert/strict";
import test from "node:test";
import { assetDetailTabs } from "./asset-detail-access.ts";

test("IGIS navigation follows each building, including mixed complexes", () => {
  const towers = [{ is_igis: true }, { is_igis: false }, {}];
  assert.deepEqual(
    towers.map((tower) => assetDetailTabs(tower).includes("이지스")),
    [true, false, false],
  );
  for (const tower of towers) {
    assert(assetDetailTabs(tower).includes("개요"));
    assert(assetDetailTabs(tower).includes("시장 임대"));
  }
});
