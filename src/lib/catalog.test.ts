import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterTransactions,
  occupancyGroups,
  unitPrice,
  type Transaction,
  type Occupancy,
} from "./catalog.ts";
const trade = {
  id: "a",
  building_id: "building",
  building_name: "테스트 오피스",
  region: "CBD",
  year: 2020,
  amount_won: 100000000,
  building_area_m2: 50000,
  traded_area_m2: 5000,
  unit_price_won: null,
  seller: "매도법인",
  buyer: "매수법인",
  scope: "일부층",
  kind: "매매",
  note: "",
  link_status: "verified",
  source_name: "테스트",
  source_url: null,
  as_of: null,
} satisfies Transaction;
test("trade filters intersect, sort missing amounts last, and never mutate input", () => {
  const rows = [
    trade,
    { ...trade, id: "b", year: 2024, scope: "전체", amount_won: null },
    { ...trade, id: "c", region: "GBD", year: 2025, amount_won: 200000000 },
  ];
  assert.deepEqual(
    filterTransactions(rows, "매수법인", "CBD", "2020", "일부층", "recent").map(
      (t) => t.id,
    ),
    ["a"],
  );
  assert.deepEqual(
    filterTransactions(rows, "", "", "", "", "amount").map((t) => t.id),
    ["c", "a", "b"],
  );
  assert.deepEqual(
    rows.map((t) => t.id),
    ["a", "b", "c"],
  );
  assert.equal(unitPrice(trade), "미확인");
  assert.equal(unitPrice({ ...trade, unit_price_won: 0 }), "0만원/평");
});
test("ended, unconfirmed and historical tenancy never becomes current occupancy", () => {
  const base: Occupancy = {
    id: "a",
    building_id: "building",
    company_id: "company",
    floors: null,
    area_m2: null,
    started_on: null,
    ended_on: null,
    status: "confirmed",
    source_name: "test",
    source_url: null,
    as_of: "2026-06-01",
  };
  const groups = occupancyGroups(
    [
      base,
      { ...base, id: "b", status: "historical" },
      { ...base, id: "c", status: "unconfirmed" },
      { ...base, id: "d", ended_on: "2025-01-01" },
      { ...base, id: "e", building_id: "other" },
    ],
    "building",
  );
  assert.deepEqual(
    groups.confirmed.map((o) => o.id),
    ["a"],
  );
  assert.deepEqual(
    groups.other.map((o) => o.id),
    ["b", "c", "d"],
  );
});
