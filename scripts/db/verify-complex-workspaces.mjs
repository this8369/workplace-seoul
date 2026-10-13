import assert from "node:assert/strict";
import { standaloneComplexes } from "./complex-policies.mjs";
import { readFile } from "node:fs/promises";
import { connectDatabase } from "../building-register/vworld-client.mjs";
const plan = JSON.parse(
  await readFile("data/private/complexes/reviewed-plan.json", "utf8"),
);
const db = await connectDatabase();
try {
  const { rows: buildings } = await db.query(
    "select id,complex_id,complex_scope from public.buildings",
  );
  const generated = (
    await db.query(
      "select tower_id,building_id from private.complex_component_assets",
    )
  ).rows;
  const materialized = new Map(
    generated.map((r) => [r.tower_id, r.building_id]),
  );
  assert.equal(buildings.length, plan.audited_buildings + generated.length);
  const { rows: towers } = await db.query(
    "select id,complex_id,building_id,label,parent_tower_id,component_kind from public.building_towers",
  );
  for (const p of standaloneComplexes)
    for (const id of p.buildingIds) {
      assert.equal(buildings.find((b) => b.id === id)?.complex_id, null);
      assert(!plan.plans.some((c) => c.members.some((m) => m.id === id)));
    }
  for (const p of plan.plans) {
    for (const m of p.members) {
      const b = buildings.find((b) => b.id === m.id);
      assert.equal(b?.complex_id, p.id);
      assert.equal(b?.complex_scope, m.scope);
    }
    for (const t of p.towers) {
      const actual = towers.find((x) => x.id === t.id);
      assert(actual);
      assert.equal(actual.label, t.label);
      assert.equal(
        actual.building_id,
        materialized.get(t.id) || t.building_id || null,
      );
      assert.equal(actual.parent_tower_id, t.parent_tower_id || null);
    }
  }
  for (const [name, labels] of [
    ["서리풀", ["남측", "북측"]],
    ["이오타 서울", ["427", "816"]],
  ]) {
    const p = plan.plans.find((p) => p.name === name);
    const rows = towers.filter(
      (t) =>
        t.complex_id === p.id &&
        !t.parent_tower_id &&
        t.component_kind !== "facility",
    );
    assert.deepEqual(rows.map((t) => t.label).sort(), labels.sort());
    assert(rows.every((t) => t.building_id));
  }
  const { rows: tables } = await db.query(
    "select relname,relrowsecurity from pg_class where relnamespace='public'::regnamespace and relname=any($1)",
    [["building_complexes", "building_towers"]],
  );
  assert(tables.every((t) => t.relrowsecurity));
  const { rows: columns } = await db.query(
    "select table_name,column_name from information_schema.columns where table_schema='public' and table_name=any($1)",
    [["catalog_complexes", "catalog_towers"]],
  );
  assert(
    columns.every(
      (c) =>
        ![
          "common_facts",
          "evidence",
          "parking_spaces",
          "contracted_capacity_mw",
          "net_area_m2",
        ].includes(c.column_name),
    ),
  );
  const { rows: invalid } = await db.query(
    "select f.id from public.building_facts f join public.buildings b on b.id=f.building_id where f.complex_id is not null and f.complex_id is distinct from b.complex_id",
  );
  assert.equal(invalid.length, 0);
  const missing = (
    await db.query(
      "select t.id from public.building_towers t join public.building_complexes c on c.id=t.complex_id where c.published and t.published and t.building_id is null and t.parent_tower_id is null and t.component_kind<>'facility'",
    )
  ).rows;
  assert.equal(
    missing.length,
    0,
    "all display components have full detail assets",
  );
  await db.query("begin");
  try {
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
    const ids = generated.map((r) => r.building_id);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from public.buildings where id=any($1::uuid[])",
          [ids],
        )
      ).rows[0].n,
      ids.length,
    );
    for (const id of ids) {
      const ctx = (
        await db.query(
          "select public.data_field_context('buildings',$1) value",
          [id],
        )
      ).rows[0].value;
      assert.equal(ctx.can_edit, true);
      assert.equal(ctx.record.id, id);
    }
    const id = ids[0];
    if (id) {
      const ctx = (
        await db.query(
          "select public.data_field_context('buildings',$1) value",
          [id],
        )
      ).rows[0].value;
      const saved = (
        await db.query(
          "select public.data_save_field('buildings',$1,'name',$2,$3,'검증') value",
          [
            id,
            JSON.stringify(ctx.record.name),
            JSON.stringify(ctx.record.name + " 검증"),
          ],
        )
      ).rows[0].value;
      assert.equal(saved.name, ctx.record.name + " 검증");
    }
  } finally {
    await db.query("rollback");
  }
  console.log(
    JSON.stringify({
      buildings: buildings.length,
      complexes: plan.plans.length,
      components: towers.length,
      labels: true,
      membership: true,
      allComponentsEditable: true,
      sharedFacts: true,
      rls: true,
      publicProjectionBoundary: true,
      unresolved: plan.excluded.length,
    }),
  );
} finally {
  await db.end();
}
