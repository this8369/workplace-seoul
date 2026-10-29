import assert from "node:assert/strict";
import test from "node:test";
import type { Leasing } from "./catalog.ts";
import { convertArea } from "./area-unit.ts";
import {
  estimateMarketRent,
  latestMarketLease,
  rentRateBasis,
  marketLeaseEfficiency,
} from "./market-rent-calculator.ts";

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

test("exclusive area converts through explicit efficiency; deposit and NOC never enter monthly cash outlay", () => {
  assert.deepEqual(estimateMarketRent(lease, 100, 50, "rentable"), {
    monthlyRent: 20_000_000,
    monthlyFee: 8_000_000,
    deposit: 200_000_000,
    monthlyFixedCost: 28_000_000,
    monthlyCostPerExclusive: 280_000,
  });
  assert.equal(
    estimateMarketRent(
      { ...lease, noc: 999_999, rent_free: 12 },
      100,
      50,
      "rentable",
    ).monthlyFixedCost,
    28_000_000,
  );
  assert.equal(
    estimateMarketRent(lease, 100, null, "exclusive").monthlyFixedCost,
    14_000_000,
  );
  const sqm = convertArea(100, "평", "m²");
  assert.equal(
    estimateMarketRent(lease, convertArea(sqm, "m²", "평"), 50, "rentable")
      .monthlyFixedCost,
    28_000_000,
  );
});

test("unconfirmed bases, invalid efficiency and missing rates stay unknown; real zero rates survive", () => {
  for (const efficiency of [null, 0, -1, 101, NaN, Infinity])
    assert.equal(
      estimateMarketRent(lease, 100, efficiency, "rentable").monthlyRent,
      null,
    );
  assert.equal(
    estimateMarketRent(lease, 100, 50, "unconfirmed").monthlyFixedCost,
    null,
  );
  assert.equal(
    estimateMarketRent({ ...lease, fee: null }, 100, 50, "rentable")
      .monthlyFixedCost,
    null,
  );
  assert.equal(
    estimateMarketRent({ ...lease, fee: 0 }, 100, 50, "rentable").monthlyFee,
    0,
  );
  assert.equal(
    estimateMarketRent(lease, 0, 50, "rentable").monthlyFixedCost,
    0,
  );
  assert.equal(
    estimateMarketRent(lease, 0, 50, "rentable").monthlyCostPerExclusive,
    null,
  );
  assert.equal(
    estimateMarketRent(lease, -1, 50, "rentable").monthlyFixedCost,
    null,
  );
  assert.equal(
    estimateMarketRent({ ...lease, currency_code: "USD" }, 100, 50, "rentable")
      .monthlyRent,
    null,
  );
  assert.equal(
    estimateMarketRent({ ...lease, rate_area_unit: "m2" }, 100, 50, "rentable")
      .monthlyRent,
    null,
  );
  assert.equal(
    estimateMarketRent(lease, Number.MAX_VALUE, 1, "rentable").monthlyRent,
    null,
  );
  assert.equal(
    rentRateBasis({ ...lease, area_basis: "면적 기준 미확인" }),
    "unconfirmed",
  );
  assert.equal(rentRateBasis(lease), "rentable");
  assert.equal(
    rentRateBasis({ ...lease, area_basis: "전용면적당" }),
    "exclusive",
  );
});

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

test("source observation efficiency wins; tower profiles cannot change another asset's denominator", () => {
  const source = { ...lease, efficiency_pct: 55.4 };
  assert.equal(marketLeaseEfficiency(source, "tower-a", 52.5), 55.4);
  assert.equal(marketLeaseEfficiency(source, "tower-b", 52.5), 55.4);
  assert.equal(marketLeaseEfficiency(lease, "tower-a", 52.5), 52.5);
  assert.equal(marketLeaseEfficiency(lease, "tower-b", 52.5), null);
  for (const invalid of [0, -1, 101, NaN, Infinity])
    assert.equal(
      marketLeaseEfficiency(
        { ...lease, efficiency_pct: invalid },
        "tower-a",
        52.5,
      ),
      null,
    );
  assert.equal(
    latestMarketLease([source, { ...source, id: "other", efficiency_pct: 50 }]),
    null,
  );
  assert.equal(
    latestMarketLease([
      source,
      { ...source, id: "other", efficiency_source_scope: "Other floor" },
    ]),
    null,
  );
  const totals = estimateMarketRent(
    source,
    100,
    marketLeaseEfficiency(source, "tower-a", 52.5),
    "rentable",
  );
  assert.ok(Math.abs(totals.monthlyRent! - (100_000 * 100) / 0.554) < 0.000001);
});
