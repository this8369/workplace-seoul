import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { connectDatabase } from "../building-register/vworld-client.mjs";
const db = await connectDatabase();
try {
  const mappings = (
    await db.query(
      "select m.*,b.component_source_building_id from private.complex_component_assets m join public.buildings b on b.id=m.building_id",
    )
  ).rows;
  assert.equal(mappings.length, 51);
  assert(
    mappings.every(
      (m) => m.component_source_building_id === m.parent_building_id,
    ),
  );
  const snapshot = JSON.parse(
    await readFile(
      "data/private/complexes/component-assets-before-1791890394735.json",
      "utf8",
    ),
  );
  for (const [table, records] of [
    ["buildings", snapshot.buildings],
    ["building_images", snapshot.images],
  ]) {
    const present = (
      await db.query(
        `select id from public.${table} where id=any($1::uuid[])`,
        [records.map((r) => r.id)],
      )
    ).rows;
    assert.equal(
      present.length,
      records.length,
      `Original ${table} rows retained`,
    );
  }
  const center = (
    await db.query(
      "select * from public.building_complexes where name='센터필드'",
    )
  ).rows[0];
  assert(center);
  const ids = [
    center.representative_building_id,
    ...mappings
      .filter((m) => m.parent_building_id === center.representative_building_id)
      .map((m) => m.building_id),
  ];
  const fixture = {};
  for (const [table, column] of [
    ["buildings", "id"],
    ["building_asset_profiles", "id"],
    ["building_power_specs", "id"],
    ["building_images", "building_id"],
    ["leasing_quarters", "building_id"],
    ["building_facts", "building_id"],
    ["building_parcels", "building_id"],
    ["building_places", "building_id"],
    ["building_register_links", "building_id"],
  ])
    fixture[table] = (
      await db.query(
        `select coalesce(jsonb_agg(to_jsonb(t)),'[]') rows from public.${table} t where ${column}=any($1::uuid[])`,
        [ids],
      )
    ).rows[0].rows;
  fixture.building_towers = (
    await db.query(
      "select jsonb_agg(to_jsonb(t)) rows from public.building_towers t where complex_id=$1",
      [center.id],
    )
  ).rows[0].rows;
  fixture.building_complexes = [center];
  fixture.asset_certification_options = (
    await db.query(
      "select jsonb_agg(to_jsonb(t)) rows from public.asset_certification_options t",
    )
  ).rows[0].rows;
  fixture.building_register_records =
    (
      await db.query(
        "select jsonb_agg(to_jsonb(t)) rows from public.building_register_records t where id=any($1::uuid[])",
        [fixture.building_register_links.map((r) => r.record_id)],
      )
    ).rows[0].rows || [];
  if (process.argv.includes("--fixture"))
    await writeFile(
      "/tmp/workplace-centerfield-fixture.json",
      JSON.stringify(fixture),
    );
  const p = fixture.building_asset_profiles.find(
    (p) => p.id === center.representative_building_id,
  );
  assert.equal(p.ceiling_height_m, 3);
  assert.equal(p.lease_span_m, 16);
  assert(p.hotels.includes("조선팰리스"));
  assert(p.certifications.length);
  await db.query("begin");
  const member = (
    await db.query(
      "select user_id from private.workplace_members where source_member_id='809a0b49-37da-40e4-b664-8adc2eba4ad3' and enabled limit 1",
    )
  ).rows[0];
  await db.query(
    "update private.workplace_members set verified_until=now()+interval '5 minutes' where user_id=$1",
    [member.user_id],
  );
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
    member.user_id,
  ]);
  for (const parent of new Set(mappings.map((m) => m.parent_building_id))) {
    for (const entity of ["building_asset_profiles", "building_power_specs"]) {
      const ctx = (
        await db.query(`select public.data_field_context($1,$2) value`, [
          entity,
          parent,
        ])
      ).rows[0].value;
      assert(ctx.can_edit);
      assert.equal(ctx.record.id, parent);
    }
  }
  const original = (
    await db.query(
      "select public.data_field_context('building_asset_profiles',$1) value",
      [p.id],
    )
  ).rows[0].value;
  const result = (
    await db.query(
      "select public.data_save_field('building_asset_profiles',$1,'lease_span_m',$2,'\"16.5\"'::jsonb,'복구 검증') value",
      [p.id, JSON.stringify(original.record.lease_span_m)],
    )
  ).rows[0].value;
  assert.equal(Number(result.lease_span_m), 16.5);
  await db.query("rollback");
  console.log(
    JSON.stringify({
      connectedComponents: 51,
      sharedAssets: 28,
      originalAssetsPreserved: snapshot.buildings.length,
      originalImagesPreserved: snapshot.images.length,
      sharedEditingVerified: true,
      centerfield: {
        ceilingHeight: p.ceiling_height_m,
        leaseSpan: p.lease_span_m,
        certifications: p.certifications.length,
        marketQuarters: fixture.leasing_quarters.length,
      },
    }),
  );
} finally {
  await db.query("rollback").catch(() => {});
  await db.end();
}
