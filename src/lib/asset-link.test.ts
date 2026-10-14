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

test("detail navigation preserves filters and removes only the asset on close", async () => {
  const { assetNavigationUrl } = await import("./asset-link.ts");
  const second = "10000000-0000-0000-0000-000000000002";
  const opened = assetNavigationUrl(
    "https://example.test/workplace/?q=Seoul",
    id,
  );
  assert.equal(sharedAssetId(new URL(opened).search), id);
  const next = assetNavigationUrl(opened, second);
  assert.equal(sharedAssetId(new URL(next).search), second);
  assert.equal(new URL(next).searchParams.get("q"), "Seoul");
  assert.equal(
    assetNavigationUrl(next, null),
    "https://example.test/workplace/?q=Seoul",
  );
  assert.notEqual(assetShareUrl(next, id), assetShareUrl(next, second));
});

test("shared IDs normalize UUID case for member-only component lookup", () => {
  const upper = "ABCDEF00-ABCD-ABCD-ABCD-ABCDEFABCDEF";
  assert.equal(sharedAssetId(`?asset=${upper}`), upper.toLowerCase());
});
