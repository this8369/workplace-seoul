import assert from "node:assert/strict";
import { connectDatabase } from "../building-register/vworld-client.mjs";
const db = await connectDatabase();
try {
  const {
    rows: [counts],
  } = await db.query(`select
    (select count(*)::int from public.buildings) buildings,
    (select count(*)::int from public.building_asset_profiles) profiles,
    (select count(*)::int from public.building_power_specs) power,
    (select count(*)::int from public.asset_certification_options) certification_options,
    (select count(*)::int from public.asset_green_spaces) parks,
    (select count(distinct building_id)::int from public.building_green_spaces) buildings_near_parks,
    (select count(*)::int from public.building_green_spaces where distance_m>500) invalid_distances`);
  assert.equal(counts.profiles, counts.buildings);
  assert.equal(counts.power, counts.buildings);
  assert(counts.certification_options >= 24);
  assert.equal(counts.invalid_distances, 0);
  const { rows: fields } = await db.query("select column_name from information_schema.columns where table_schema='public' and table_name='building_asset_profiles' and column_name=any($1)", [['site_area_m2','floor_area_ratio','efficiency_pct']]);
  assert.equal(fields.length,3);
  const { rows: [register] } = await db.query("select count(distinct l.building_id)::int linked_assets from public.building_register_links l join public.building_register_records r on r.id=l.record_id where l.status='verified' and r.is_current");
  console.log('Building register verified links:', register);
  const tables = [
    "building_asset_profiles",
    "building_power_specs",
    "asset_certification_options",
    "asset_vocabulary",
    "asset_green_spaces",
  ];
  const { rows } = await db.query(
    "select relname, relrowsecurity from pg_class where relnamespace='public'::regnamespace and relname=any($1)",
    [tables],
  );
  assert.equal(rows.length, tables.length);
  assert(rows.every((x) => x.relrowsecurity));
  for (const t of tables) {
    const {
      rows: [r],
    } = await db.query(
      "select has_table_privilege('anon',$1,'select') anon_read, has_table_privilege('authenticated',$1,'update') direct_write",
      [`public.${t}`],
    );
    assert.equal(r.anon_read, false);
    assert.equal(r.direct_write, false);
  }
  console.log(
    JSON.stringify({
      ...counts,
      rls: true,
      no_anonymous_access: true,
      no_direct_writes: true,
    }),
  );
  console.log(
    "Station name samples:",
    (
      await db.query(
        "select distinct name from public.building_places where category='transit' and distance_m<=500 and name like '%역%' limit 12",
      )
    ).rows,
  );
} finally {
  await db.end();
}
