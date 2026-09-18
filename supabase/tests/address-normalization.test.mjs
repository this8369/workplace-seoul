import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeAddress,
  exactAddressMatch,
} from "../../scripts/db/address-normalization.mjs";
test("normalizes equivalent addresses while preserving lot identities and missing values", () => {
  for (const a of [
    "경기 분당구 구미동 188",
    "경기도 성남 분당구 구미동 188",
    "성남 분당구 구미동 188",
  ])
    assert.equal(normalizeAddress(a), "경기도 성남시 분당구 구미동 188");
  assert.equal(
    normalizeAddress("서울 서초구 서초동 1321 11", true),
    "서울특별시 서초구 서초동 1321-11",
  );
  assert.equal(
    normalizeAddress("서울 서초구 서초동 1321 0", true),
    "서울특별시 서초구 서초동 1321",
  );
  assert.equal(
    normalizeAddress("서울 서초구 서초동 1321 11"),
    "서울특별시 서초구 서초동 1321 11",
  );
  assert.equal(normalizeAddress("."), "");
});
const candidate = (lot, x = "126.98") => ({
  x,
  y: "37.57",
  addressElements: [
    ["SIDO", "서울특별시"],
    ["SIGUGUN", "중구"],
    ["DONGMYUN", "수표동"],
    ["LAND_NUMBER", lot],
  ].map(([type, longName]) => ({ types: [type], longName })),
});
test("geocoder acceptance rejects similar parcels, ambiguous coordinates and non-Korean points", () => {
  assert.ok(exactAddressMatch("서울 중구 수표동 99", [candidate("99")]));
  assert.equal(
    exactAddressMatch("서울 중구 수표동 99", [candidate("99-1")]),
    null,
  );
  assert.equal(
    exactAddressMatch("서울 중구 수표동 99", [
      candidate("99"),
      candidate("99", "126.99"),
    ]),
    null,
  );
  assert.equal(
    exactAddressMatch("서울 중구 수표동 99", [candidate("99", "0")]),
    null,
  );
});
