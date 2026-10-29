import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { connectDatabase } from "../building-register/vworld-client.mjs";
import {
  sourceEfficiencies,
  leaseMatchesSource,
  wholeAssetEfficiency,
} from "../import/market-efficiency.mjs";
const apply = process.argv.includes("--apply");
const sources = sourceEfficiencies(
  JSON.parse(await readFile("data/private/normalized.json", "utf8")),
  JSON.parse(await readFile("data/private/source-snapshot.json", "utf8")),
);
const db = await connectDatabase();
try {
  await db.query("begin");
  await db.query(
    "select pg_advisory_xact_lock(hashtext('market-efficiency-import'))",
  );
  const buildings = (
    await db.query(
      "select id,name,complex_id,complex_scope from public.buildings order by id",
    )
  ).rows;
  const profiles = (
    await db.query(
      "select id,efficiency_pct from public.building_asset_profiles order by id for update",
    )
  ).rows;
  const leases = (
    await db.query(
      "select * from public.leasing_quarters order by id for update",
    )
  ).rows;
  const profileEdits = new Set(
    (
      await db.query(
        "select distinct record_id from private.data_record_history where entity='building_asset_profiles' and 'efficiency_pct'=any(changed_fields)",
      )
    ).rows.map((r) => r.record_id),
  );
  const leaseEdits = new Set(
    (
      await db.query(
        "select distinct record_id from private.data_record_history where entity='leasing_quarters' and 'efficiency_pct'=any(changed_fields)",
      )
    ).rows.map((r) => r.record_id),
  );
  const changes = [],
    skipped = [],
    preserved = [];
  await db.query(
    "select set_config('app.review_origin','rsquare_efficiency_import',true)",
  );
  for (const source of sources) {
    const building = buildings.find((b) => b.id === source.id);
    if (!building) {
      skipped.push({ id: source.id, reason: "asset-id-not-found" });
      continue;
    }
    const reason = `알스퀘어 원자료 전용률 ${source.sourcePeriod} · ${source.name} · ${source.sourceUrl}`;
    await db.query("select set_config('app.review_reason',$1,true)", [reason]);
    const profile = profiles.find((p) => p.id === source.id);
    if (
      wholeAssetEfficiency(source, building) &&
      source.leases.some((original) =>
        leaseMatchesSource(
          leases.find((l) => l.id === original.id),
          original,
        ),
      ) &&
      profile?.efficiency_pct == null &&
      !profileEdits.has(source.id)
    ) {
      await db.query(
        "update public.building_asset_profiles set efficiency_pct=$2 where id=$1 and efficiency_pct is null",
        [source.id, source.pct],
      );
      changes.push({
        entity: "building_asset_profiles",
        id: source.id,
        pct: source.pct,
        sourceUrl: source.sourceUrl,
        sourcePeriod: source.sourcePeriod,
        sourceScope: source.name,
      });
    } else if (profile?.efficiency_pct != null || profileEdits.has(source.id)) {
      preserved.push({ id: source.id, reason: "existing-or-edited-profile" });
    } else
      skipped.push({
        id: source.id,
        name: source.name,
        reason: "aggregate-or-selected-floor-profile",
        pct: source.pct,
      });
    const leaseIds = [];
    for (const original of source.leases) {
      const lease = leases.find((l) => l.id === original.id);
      if (!leaseMatchesSource(lease, original)) {
        skipped.push({
          id: original.id,
          reason: "lease-source-or-value-conflict",
        });
        continue;
      }
      if (lease.efficiency_pct != null) {
        if (Number(lease.efficiency_pct) !== source.pct)
          preserved.push({
            id: lease.id,
            reason: "existing-market-efficiency",
          });
        continue;
      }
      if (leaseEdits.has(lease.id)) {
        preserved.push({
          id: lease.id,
          reason: "previously-edited-market-efficiency",
        });
        continue;
      }
      leaseIds.push(lease.id);
    }
    if (leaseIds.length) {
      const update = await db.query(
        "update public.leasing_quarters set efficiency_pct=$2,efficiency_source_period=$3,efficiency_source_scope=$4 where id=any($1::uuid[]) and efficiency_pct is null",
        [leaseIds, source.pct, source.sourcePeriod, source.name],
      );
      assert.equal(update.rowCount, leaseIds.length);
      changes.push(
        ...leaseIds.map((id) => ({
          entity: "leasing_quarters",
          id,
          pct: source.pct,
          sourceUrl: source.sourceUrl,
          sourcePeriod: source.sourcePeriod,
          sourceScope: source.name,
        })),
      );
    }
  }
  const afterLeases = (
    await db.query("select * from public.leasing_quarters order by id")
  ).rows;
  const withoutEfficiency = (rows) =>
    rows.map(
      ({
        efficiency_pct,
        efficiency_source_period,
        efficiency_source_scope,
        ...rest
      }) => rest,
    );
  assert.deepEqual(
    withoutEfficiency(afterLeases),
    withoutEfficiency(leases),
    "All market amounts, bases, source links and publication states must survive",
  );
  const afterProfiles = (
    await db.query(
      "select id,efficiency_pct from public.building_asset_profiles order by id",
    )
  ).rows;
  for (const before of profiles.filter(
    (p) => p.efficiency_pct != null || profileEdits.has(p.id),
  ))
    assert.deepEqual(
      afterProfiles.find((p) => p.id === before.id),
      before,
    );
  // Public records can corroborate area scope, but cannot prove which common
  // areas the owner includes in the contractual rentable denominator.
  const registerCoverage = (
    await db.query(
      "select count(distinct l.building_id)::int linked_assets,count(a.id)::int area_parts from public.building_register_links l join public.building_register_records r on r.id=l.record_id and r.is_current join public.building_register_area_parts a on a.record_id=r.id where l.status='verified'",
    )
  ).rows[0];
  const missing = buildings
    .filter((b) => !afterProfiles.find((p) => p.id === b.id)?.efficiency_pct)
    .map((b) => ({
      id: b.id,
      name: b.name,
      scope: b.complex_scope,
      hasSourceMarketEfficiency: afterLeases.some(
        (l) => l.building_id === b.id && l.efficiency_pct != null,
      ),
    }));
  const report = {
    apply,
    sourceAssets: sources.length,
    sourceMarketRows: sources.flatMap((s) => s.leases).length,
    profileUpdates: changes.filter(
      (c) => c.entity === "building_asset_profiles",
    ).length,
    marketUpdates: changes.filter((c) => c.entity === "leasing_quarters")
      .length,
    profilesWithEfficiency: afterProfiles.filter(
      (p) => p.efficiency_pct != null,
    ).length,
    marketRowsWithEfficiency: afterLeases.filter(
      (l) => l.efficiency_pct != null,
    ).length,
    registerCoverage,
    changes,
    skipped,
    preserved,
    missing,
  };
  await mkdir("data/private/market-efficiency", { recursive: true });
  if (apply)
    await writeFile(
      `data/private/market-efficiency/before-${Date.now()}.json`,
      JSON.stringify({ profiles, leases }),
      { mode: 0o600 },
    );
  await writeFile(
    `data/private/market-efficiency/${apply ? "applied" : "preview"}.json`,
    JSON.stringify(report, null, 2),
    { mode: 0o600 },
  );
  await db.query(apply ? "commit" : "rollback");
  console.log(
    JSON.stringify({
      ...report,
      changes: changes.length,
      skipped: skipped.length,
      preserved: preserved.length,
      missing: missing.length,
      existingAmountsAndBasesPreserved: true,
    }),
  );
} catch (e) {
  await db.query("rollback");
  throw e;
} finally {
  await db.end();
}
