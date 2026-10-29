import assert from "node:assert/strict";
import test from "node:test";
import {
  sourceEfficiencies,
  leaseMatchesSource,
  wholeAssetEfficiency,
} from "../../scripts/import/market-efficiency.mjs";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const original = [];
original[2] = "Tower A <6층~19층>";
original[24] = 0.554;
original.splice(25, 6, 1000000, 100000, 40000, 0, 0, 255000);
const normalized = [
  {
    title: "01 Buildings",
    headers: [
      "건물ID",
      "건물명",
      "자산구분",
      "전용률",
      "원본행",
      "원본링크",
      "원본기준월",
    ],
    rows: [["a", "Tower A", "기성", 0.554, 4, "source#row4", "2026-06"]],
  },
  {
    title: "02 Leases",
    headers: [
      "임대기록ID",
      "건물ID",
      "기준분기",
      "원본링크",
      "보증금_원평",
      "월임대료_원평",
      "관리비_원평",
      "NOC_원평",
      "공실률",
      "렌트프리_개월년",
    ],
    rows: [
      [
        "q",
        "a",
        "2025.4Q",
        "source#row4",
        1000000,
        100000,
        40000,
        255000,
        0,
        0,
      ],
    ],
  },
];
const quarterHeader = [];
quarterHeader[25] = "2025.4Q";
const raw = { tabs: { operating: [[], quarterHeader, [], original] } };
test("source percentages retain raw floor scope and month; matching rejects changed or unrelated rates", () => {
  const [s] = sourceEfficiencies(normalized, raw);
  assert.equal(s.pct, 55.4);
  assert.equal(s.name, "Tower A <6층~19층>");
  assert.equal(s.sourcePeriod, "2026-06");
  assert.equal(s.floorScoped, true);
  assert.equal(
    wholeAssetEfficiency(s, { id: "a", complex_scope: "component" }),
    false,
  );
  assert.equal(
    wholeAssetEfficiency(
      { ...s, floorScoped: false },
      { id: "a", complex_scope: "aggregate" },
    ),
    false,
  );
  assert.equal(
    wholeAssetEfficiency(
      { ...s, floorScoped: false },
      { id: "a", complex_scope: "component" },
    ),
    true,
  );
  assert.equal(
    wholeAssetEfficiency(
      { ...s, floorScoped: false },
      { id: "b", complex_scope: "component" },
    ),
    false,
  );
  const q = {
    ...s.leases[0],
    provider_code: "rsquare",
    data_domain: "market_leasing",
    currency_code: "KRW",
    rate_area_unit: "pyeong",
  };
  assert(leaseMatchesSource(q, s.leases[0]));
  for (const patch of [
    { building_id: "b" },
    { source_url: "other" },
    { rent: 99999 },
    { period: "2026.1Q" },
    { provider_code: "other" },
    { vacancy: null },
    { currency_code: "USD" },
  ])
    assert.equal(leaseMatchesSource({ ...q, ...patch }, s.leases[0]), false);
  const bad = structuredClone(raw);
  bad.tabs.operating[3][24] = 0.5;
  assert.throws(
    () => sourceEfficiencies(normalized, bad),
    /Invalid source efficiency/,
  );
  const editedRaw = structuredClone(raw);
  editedRaw.tabs.operating[3][26] = 123456;
  const [changed] = sourceEfficiencies(normalized, editedRaw);
  assert.equal(leaseMatchesSource(q, changed.leases[0]), false);
});

test("market efficiency migration preserves public projection boundary and validates percentage", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema private; create role anon; create role authenticated;
   create function public.is_public_detail_asset(uuid) returns boolean language sql as $$select $1='00000000-0000-0000-0000-000000000001'::uuid$$;
   create table private.catalog_publications(record_type text,record_id uuid);
   create table public.leasing_quarters(id uuid primary key,building_id uuid,period text,deposit numeric,rent numeric,fee numeric,noc numeric,vacancy numeric,rent_free numeric,area_basis text,vat_basis text,source_name text,source_url text,as_of date,published boolean,data_domain text,provider_code text,observation_basis text,currency_code text,rate_area_unit text);
   create view public.detail_leasing_quarters with(security_barrier=true) as select r.* from public.leasing_quarters r where public.is_public_detail_asset(r.building_id) and r.data_domain='market_leasing' and r.published;
   grant select on public.detail_leasing_quarters to anon,authenticated;`);
    await db.exec(
      await readFile(
        new URL(
          "../migrations/202610290003_market_efficiency.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(`insert into public.leasing_quarters(id,building_id,published,data_domain,efficiency_pct) values
   ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',true,'market_leasing',55.4),
   ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002',true,'market_leasing',50),
   ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001',false,'market_leasing',51),
   ('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001',true,'private_operations',52)`);
    for (const invalid of [0, -1, 101])
      await assert.rejects(
        () =>
          db.query("update leasing_quarters set efficiency_pct=$1", [invalid]),
        /check constraint/,
      );
    await db.exec("set role anon");
    const rows = (
      await db.query(
        "select efficiency_pct from public.detail_leasing_quarters",
      )
    ).rows;
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0].efficiency_pct), 55.4);
    await assert.rejects(
      () => db.query("update leasing_quarters set efficiency_pct=40"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
