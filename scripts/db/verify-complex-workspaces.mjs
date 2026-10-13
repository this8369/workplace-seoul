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
  assert.equal(buildings.length, plan.audited_buildings);
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
      assert.equal(actual.building_id, t.building_id || null);
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
  console.log(
    JSON.stringify({
      buildings: buildings.length,
      complexes: plan.plans.length,
      components: towers.length,
      labels: true,
      membership: true,
      sharedFacts: true,
      rls: true,
      publicProjectionBoundary: true,
      unresolved: plan.excluded.length,
    }),
  );
} finally {
  await db.end();
}
