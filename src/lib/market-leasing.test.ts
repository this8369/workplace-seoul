import assert from "node:assert/strict";
import test from "node:test";
import type { Leasing } from "./catalog.ts";
import { latestMarketLease, rentRateBasis } from "./market-leasing.ts";

const lease: Leasing = {
  id: "latest",
  building_id: "tower-a",
  period: "2025.4Q",
  data_domain: "market_leasing",
  provider_code: "rsquare",
  deposit: 1_000_000,
  rent: 100_000,
  fee: 40_000,
  noc: 250_000,
  rent_free: 2,
  vacancy: null,
  area_basis: "임대면적 기준",
  vat_basis: "부가세 별도",
  source_name: "알스퀘어",
  source_url: null,
  as_of: null,
  currency_code: "KRW",
  rate_area_unit: "pyeong",
};

test("latest quarter is chronological, keeps partial data and rejects conflicting latest duplicates", () => {
  const older = { ...lease, id: "old", period: "2024.4Q" };
  const partial = { ...lease, deposit: null, rent: null };
  assert.equal(latestMarketLease([older, partial]), partial);
  assert.equal(
    latestMarketLease([lease, { ...lease, id: "duplicate" }]),
    lease,
  );
  assert.equal(
    latestMarketLease([
      older,
      lease,
      { ...lease, id: "conflict", rent: 200_000 },
    ]),
    null,
  );
  assert.equal(
    latestMarketLease([{ ...lease, period: "2026.5Q" }, lease]),
    lease,
  );
  assert.equal(
    latestMarketLease([
      { ...lease, data_domain: "private_operations" } as unknown as Leasing,
    ]),
    null,
  );
  assert.equal(latestMarketLease([]), null);
});

test("rate labels follow the source area basis", () => {
  assert.equal(rentRateBasis(lease), "rentable");
  assert.equal(
    rentRateBasis({ ...lease, area_basis: "전용면적당" }),
    "exclusive",
  );
  assert.equal(
    rentRateBasis({ ...lease, area_basis: "면적 기준 미확인" }),
    "unconfirmed",
  );
});
