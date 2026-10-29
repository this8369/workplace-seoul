import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { connectDatabase } from "../building-register/vworld-client.mjs";
const preview = process.argv.includes("--preview");
const db = await connectDatabase();
try {
  await db.query("begin");
  await db.query("set local statement_timeout='30s'");
  if (preview) {
    const before = (
      await db.query(
        "select viewname,definition from pg_views where schemaname='public' and viewname in ('detail_buildings','detail_building_asset_profiles','detail_building_complexes')",
      )
    ).rows;
    await mkdir("data/private/asset-overview", { recursive: true });
    await writeFile(
      "data/private/asset-overview/register-views-before.json",
      JSON.stringify(before, null, 2),
    );
    const sql = await readFile(
      "supabase/migrations/202610290001_register_overview_connection.sql",
      "utf8",
    );
    await db.query(sql.replace(/^begin;\s*/, "").replace(/commit;\s*$/, ""));
  }
  const {
    rows: [counts],
  } = await db.query(`select count(*)::int assets,
  count(*) filter(where p.site_area_m2 is null and dp.site_area_m2 is not null)::int site_area_m2,
  count(*) filter(where p.floor_area_ratio is null and dp.floor_area_ratio is not null)::int floor_area_ratio,
  count(*) filter(where b.floors_above is null and d.floors_above is not null)::int floors_above,
  count(*) filter(where b.floors_below is null and d.floors_below is not null)::int floors_below,
  count(*) filter(where b.gross_area_m2 is null and d.gross_area_m2 is not null)::int gross_area_m2,
  count(*) filter(where b.parking_spaces is null and d.parking_spaces is not null and b.complex_id is null)::int parking_spaces,
  count(*) filter(where b.completion_year is null and d.completion_year is not null)::int completion_year,
  count(*) filter(where b.usage_approved_on is null and d.usage_approved_on is not null)::int usage_approved_on
  from buildings b join detail_buildings d on d.id=b.id
  join building_asset_profiles p on p.id=b.id join detail_building_asset_profiles dp on dp.id=b.id`);
  const {
    rows: [common],
  } = await db.query(
    `select count(*) filter(where c.parking_spaces is null and d.parking_spaces is not null)::int parking_spaces from building_complexes c join detail_building_complexes d on d.id=c.id`,
  );
  const {
    rows: [preserved],
  } =
    await db.query(`select count(*)::int violations from buildings b join detail_buildings d on d.id=b.id join building_asset_profiles p on p.id=b.id join detail_building_asset_profiles dp on dp.id=b.id where
  (b.gross_area_m2 is not null and b.gross_area_m2 is distinct from d.gross_area_m2)
  or (b.floors_above is not null and b.floors_above is distinct from d.floors_above)
  or (b.floors_below is not null and b.floors_below is distinct from d.floors_below)
  or (b.parking_spaces is not null and b.parking_spaces is distinct from d.parking_spaces)
  or (p.site_area_m2 is not null and p.site_area_m2 is distinct from dp.site_area_m2)
  or (p.floor_area_ratio is not null and p.floor_area_ratio is distinct from dp.floor_area_ratio)`);
  assert.equal(preserved.violations, 0);
  const {
    rows: [scope],
  } = await db.query(
    `select count(*)::int violations from detail_building_register_overview f join buildings b on b.id=f.id left join building_register_records r on r.id=f.own_record_id where b.complex_scope='component' and (f.gross_area_m2 is not null or f.floors_above is not null or f.floors_below is not null) and (r.record_kind is distinct from 'building' or not exists(select 1 from building_register_links l where l.building_id=b.id and l.record_id=r.id and l.status='verified'))`,
  );
  assert.equal(scope.violations, 0);
  const {
    rows: [planned],
  } = await db.query(
    "select count(*)::int violations from detail_building_register_overview f join buildings b on b.id=f.id where b.status='development' and (f.own_record_id is not null or f.common_record_id is not null)",
  );
  assert.equal(planned.violations, 0);
  for (const role of ["anon", "authenticated"]) {
    await db.query(`set local role ${role}`);
    assert(
      (
        await db.query(
          "select count(*)::int n from detail_building_register_overview",
        )
      ).rows[0].n > 0,
    );
    const rights = (
      await db.query(
        "select has_table_privilege(current_user,'public.detail_building_register_overview','INSERT,UPDATE,DELETE') allowed",
      )
    ).rows[0];
    assert.equal(rights.allowed, false);
    await db.query("reset role");
  }
  await db.query("rollback");
  const report = {
    mode: preview ? "preview" : "applied",
    connected: counts,
    complexCommon: common,
    manualValuesPreserved: true,
    componentScopeChecked: true,
    readOnlyPublicView: true,
  };
  await mkdir("data/private/asset-overview", { recursive: true });
  await writeFile(
    `data/private/asset-overview/register-connection-${preview ? "preview" : "applied"}.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await db.query("rollback").catch(() => {});
  await db.end();
}
