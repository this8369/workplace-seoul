import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { connectDatabase } from "../building-register/vworld-client.mjs";
import {
  sourceEfficiencies,
  leaseMatchesSource,
  wholeAssetEfficiency,
} from "../import/market-efficiency.mjs";
const sources = sourceEfficiencies(
  JSON.parse(await readFile("data/private/normalized.json", "utf8")),
  JSON.parse(await readFile("data/private/source-snapshot.json", "utf8")),
);
const report = JSON.parse(
  await readFile("data/private/market-efficiency/applied.json", "utf8"),
);
const db = await connectDatabase();
try {
  await db.query("begin read only");
  const leases = (await db.query("select * from public.leasing_quarters")).rows;
  const profiles = (
    await db.query(
      "select p.id,p.efficiency_pct,b.complex_scope from public.building_asset_profiles p join public.buildings b on b.id=p.id",
    )
  ).rows;
  for (const change of report.changes) {
    const source = sources.find(
      (s) => s.id === change.id || s.leases.some((q) => q.id === change.id),
    );
    assert(source);
    if (change.entity === "leasing_quarters") {
      const lease = leases.find((l) => l.id === change.id),
        original = source.leases.find((q) => q.id === change.id);
      assert(leaseMatchesSource(lease, original));
      assert.equal(Number(lease.efficiency_pct), source.pct);
      assert.equal(lease.efficiency_source_period, source.sourcePeriod);
      assert.equal(lease.efficiency_source_scope, source.name);
    } else {
      const profile = profiles.find((p) => p.id === change.id);
      assert(wholeAssetEfficiency(source, profile));
      assert.equal(Number(profile.efficiency_pct), source.pct);
    }
  }
  const ifc = sources.filter((s) => /\(IFC [123]\)/.test(s.name));
  assert.equal(ifc.length, 3);
  assert.deepEqual(
    ifc
      .map((s) => Number(profiles.find((p) => p.id === s.id).efficiency_pct))
      .sort(),
    [52.5, 55.4, 55.8],
  );
  const env = await readFile(".env.local", "utf8");
  const value = (name) =>
    env.match(new RegExp(`^${name}=["']?([^\\s"']+)`, "m"))?.[1];
  const client = createClient(
    value("VITE_SUPABASE_URL"),
    value("VITE_SUPABASE_PUBLISHABLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const publicMarket = await client
    .from("detail_leasing_quarters")
    .select("building_id,efficiency_pct,efficiency_source_period")
    .in(
      "building_id",
      ifc.map((s) => s.id),
    );
  assert.ifError(publicMarket.error);
  assert.equal(publicMarket.data.length, 12);
  for (const row of publicMarket.data)
    assert.equal(
      row.efficiency_pct,
      ifc.find((s) => s.id === row.building_id).pct,
    );
  const publicProfile = await client
    .from("detail_building_asset_profiles")
    .select("id,efficiency_pct")
    .in(
      "id",
      ifc.map((s) => s.id),
    );
  assert.ifError(publicProfile.error);
  assert.equal(publicProfile.data.length, 3);
  const denied = await client.from("leasing_quarters").select("id").limit(1);
  assert.equal(denied.error?.code, "42501");
  const history = (
    await db.query(
      "select count(*)::int n from private.data_record_history where origin='rsquare_efficiency_import' and 'efficiency_pct'=any(changed_fields)",
    )
  ).rows[0].n;
  assert(history >= report.changes.length);
  await db.query("rollback");
  console.log(
    JSON.stringify({
      sourceAssets: sources.length,
      verifiedMarketRows: report.marketUpdates,
      verifiedProfileUpdates: report.profileUpdates,
      ifcIndependentEfficiencies: ifc.map((s) => ({
        name: s.name,
        pct: s.pct,
      })),
      anonymousMarketAndOverview: true,
      rawMarketDenied: true,
      auditedChanges: history,
      amountsAndBasesPreserved: true,
    }),
  );
} finally {
  await db.end();
}
