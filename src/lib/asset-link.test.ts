import { test } from "node:test";
import assert from "node:assert/strict";
import { assetShareUrl, sharedAssetId } from "./asset-link.ts";
const id = "10000000-0000-0000-0000-000000000001";
test("asset links retain the deployment path but never share login tokens or search filters", () => {
  const result = assetShareUrl(
    "https://example.test/workplace/?login=1&token=secret&q=private#access_token=secret",
    id,
  );
  assert.equal(result, `https://example.test/workplace/?asset=${id}`);
  assert.equal(sharedAssetId(new URL(result).search), id);
  assert.equal(sharedAssetId("?asset=https://other.test"), null);
  assert.equal(sharedAssetId("?q=something"), null);
});
