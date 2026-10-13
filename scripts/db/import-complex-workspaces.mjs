import assert from "node:assert/strict";
import { standaloneComplexes } from "./complex-policies.mjs";
import { isDeepStrictEqual } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { connectDatabase } from "../building-register/vworld-client.mjs";
const path =
  process.argv.find((x) => x.startsWith("--plan="))?.slice(7) ||
  "data/private/complexes/reviewed-plan.json";
assert(path.startsWith("data/private/") && path.endsWith(".json"));
const { plans, audited_buildings, excluded } = JSON.parse(
  await readFile(path, "utf8"),
);
for (const p of plans)
  assert(
    !standaloneComplexes.some(
      (x) =>
        x.id === p.id || p.members.some((m) => x.buildingIds.includes(m.id)),
    ),
    "Explicit standalone asset must not be regrouped",
  );
const db = await connectDatabase(),
  apply = process.argv.includes("--apply");
const report = {
  apply,
  audited_buildings,
  complexes: plans.length,
  components: 0,
  facilities: 0,
  changed: 0,
  publicComplexes: 0,
  unresolved: excluded.length,
};
const same = (a, b) =>
  typeof b === "number"
    ? a != null && Math.abs(Number(a) - b) < 0.0001
    : isDeepStrictEqual(a, b);
async function upsert(table, id, patch) {
  assert(["building_complexes", "building_towers"].includes(table));
  const old = (
    await db.query(`select * from public.${table} where id=$1`, [id])
  ).rows[0];
  const entries = Object.entries(patch).filter(
    ([k, v]) => v !== undefined && (!old || !same(old[k], v)),
  );
  if (!entries.length) return;
  const vals = entries.map(([, v]) =>
    v && typeof v === "object" ? JSON.stringify(v) : v,
  );
  if (old)
    await db.query(
      `update public.${table} set ${entries.map(([k], i) => `${k}=$${i + 2}`).join(",")} where id=$1`,
      [id, ...vals],
    );
  else
    await db.query(
      `insert into public.${table}(id,${entries.map(([k]) => k).join(",")}) values($1,${entries.map((_, i) => "$" + (i + 2)).join(",")})`,
      [id, ...vals],
    );
  report.changed++;
}
try {
  await db.query("begin");
  await db.query(
    "set constraints building_towers_complex_id_sort_order_key deferred",
  );
  await db.query(
    "select set_config('app.review_origin','complex_scope_import',true),set_config('app.review_reason','전체 자산 단지·동 구조 분리: 기존 ID와 값 보존, 검토된 구성 및 공통 범위 연결',true)",
  );
  const before = {
    buildings: (
      await db.query("select id,complex_id,complex_scope from public.buildings")
    ).rows,
    complexes: (await db.query("select * from public.building_complexes")).rows,
    towers: (await db.query("select * from public.building_towers")).rows,
  };
  const materialized = new Map(
    (
      await db.query(
        "select tower_id,building_id from private.complex_component_assets",
      )
    ).rows.map((r) => [r.tower_id, r.building_id]),
  );
  if (apply)
    await writeFile(
      `data/private/complexes/before-${Date.now()}.json`,
      JSON.stringify(before, null, 2),
    );
  const published = new Set(
    (
      await db.query(
        "select record_id from private.catalog_publications where record_type='buildings'",
      )
    ).rows.map((r) => r.record_id),
  );
  for (const p of plans) {
    assert(
      p.members.length &&
        p.members.some((m) => m.id === p.representative_building_id),
    );
    assert(p.gross_area_m2 > 0);
    assert(new Set(p.towers.map((t) => t.id)).size === p.towers.length);
    assert(new Set(p.towers.map((t) => t.label)).size === p.towers.length);
    const ids = p.members.map((m) => m.id);
    const existing = (
      await db.query(
        "select * from public.buildings where id=any($1::uuid[])",
        [ids],
      )
    ).rows;
    assert.equal(existing.length, ids.length);
    for (const b of existing)
      assert(
        !b.complex_id || b.complex_id === p.id,
        `Already assigned ${b.name}`,
      );
    // Preserve original observations and attach one deduplicated common display.
    const facts = (
      await db.query(
        "select * from public.building_facts where building_id=any($1::uuid[]) and source_name like '사용자 제공 주요 자산 비교표%' order by id",
        [ids],
      )
    ).rows;
    const common = p.common_facts || [];
    const shared =
      existing.length === 1 && p.members[0].scope === "aggregate"
        ? existing[0]
        : null;
    const power = shared
      ? (
          await db.query(
            "select * from public.building_power_specs where building_id=$1",
            [shared.id],
          )
        ).rows[0]
      : null;
    await upsert("building_complexes", p.id, {
      name: p.name,
      representative_building_id: p.representative_building_id,
      gross_area_m2: p.gross_area_m2,
      area_method: p.area_method,
      area_scope: p.area_scope,
      source_note: p.source_note,
      published: true,
      common_facts: common,
      parking_spaces: p.parking_spaces ?? shared?.parking_spaces ?? undefined,
      contracted_capacity_mw:
        p.contracted_capacity_mw ?? power?.contracted_capacity_mw ?? undefined,
      dual_substation: p.dual_substation ?? power?.dual_substation ?? undefined,
    });
    for (const m of p.members) {
      const result = await db.query(
        "update public.buildings set complex_id=$1,complex_scope=$2 where id=$3 and (complex_id is distinct from $1 or complex_scope is distinct from $2)",
        [p.id, m.scope, m.id],
      );
      report.changed += result.rowCount;
    }
    const scoped = await db.query(
      "update public.building_facts set complex_id=$1 where id=any($2::uuid[]) and complex_id is distinct from $1",
      [p.id, facts.map((f) => f.id)],
    );
    report.changed += scoped.rowCount;
    for (const t of p.towers) {
      if (t.building_id) assert(ids.includes(t.building_id));
      const patch = {
        complex_id: p.id,
        building_id: materialized.get(t.id) || t.building_id || null,
        label: t.label,
        sort_order: t.sort_order,
        component_kind: t.component_kind || "building",
        published: true,
        evidence: {
          ...before.towers.find((row) => row.id === t.id)?.evidence,
          ...t.evidence,
        },
      };
      for (const k of [
        "parent_tower_id",
        "gross_area_m2",
        "net_area_m2",
        "floors_above",
        "floors_below",
        "parking_spaces",
        "contracted_capacity_mw",
        "main_use",
        "overview",
      ])
        if (t[k] !== undefined) patch[k] = t[k];
      await upsert("building_towers", t.id, patch);
      if (t.component_kind === "facility") report.facilities++;
      else report.components++;
    }
    // Previously published source records only. No private master names/figures
    // are promoted merely because a building was included in the inventory.
    if (published.has(p.representative_building_id)) {
      await db.query(
        "insert into private.catalog_publications(record_type,record_id) values('building_complexes',$1) on conflict do nothing",
        [p.id],
      );
      report.publicComplexes++;
      for (const t of p.towers)
        if (!t.building_id || published.has(t.building_id))
          await db.query(
            "insert into private.catalog_publications(record_type,record_id) values('building_towers',$1) on conflict do nothing",
            [t.id],
          );
    }
  }
  assert.equal(
    (await db.query("select count(*)::int n from public.buildings")).rows[0].n,
    before.buildings.length,
  );
  const invalid = (
    await db.query(
      "select t.id from public.building_towers t join public.buildings b on b.id=t.building_id where b.complex_id<>t.complex_id",
    )
  ).rows;
  assert.equal(invalid.length, 0);
  await db.query(apply ? "commit" : "rollback");
  await writeFile(
    `data/private/complexes/${apply ? "applied" : "preview"}.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} catch (e) {
  await db.query("rollback");
  throw e;
} finally {
  await db.end();
}
