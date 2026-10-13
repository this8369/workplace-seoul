import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { connectDatabase } from "../building-register/vworld-client.mjs";
import { standaloneComplexes } from "./complex-policies.mjs";
const db = await connectDatabase();
const apply = process.argv.includes("--apply");
try {
  await db.query("begin");
  await db.query(
    "select set_config('app.review_origin','complex_scope_correction',true),set_config('app.review_reason','사용자 요청: 코엑스 단지 연결 해제, 개별 건물로 표시',true)",
  );
  const report = [];
  for (const policy of standaloneComplexes) {
    const before = {
      buildings: (
        await db.query(
          "select * from public.buildings where id=any($1::uuid[]) for update",
          [policy.buildingIds],
        )
      ).rows,
      complex: (
        await db.query(
          "select * from public.building_complexes where id=$1 for update",
          [policy.id],
        )
      ).rows,
      towers: (
        await db.query(
          "select * from public.building_towers where complex_id=$1 for update",
          [policy.id],
        )
      ).rows,
      facts: (
        await db.query(
          "select * from public.building_facts where complex_id=$1",
          [policy.id],
        )
      ).rows,
    };
    assert.equal(before.buildings.length, policy.buildingIds.length);
    assert(
      before.buildings.every(
        (b) => !b.complex_id || b.complex_id === policy.id,
      ),
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from public.buildings where complex_id=$1 and not(id=any($2::uuid[]))",
          [policy.id, policy.buildingIds],
        )
      ).rows[0].n,
      0,
    );
    if (apply)
      await writeFile(
        `data/private/complexes/ungroup-before-${Date.now()}.json`,
        JSON.stringify(before, null, 2),
      );
    // Keep all source and review records; retire only the presentation links.
    await db.query(
      "update public.building_facts set complex_id=null where complex_id=$1",
      [policy.id],
    );
    await db.query(
      "update public.building_towers set building_id=null,published=false where complex_id=$1 and (building_id is not null or published)",
      [policy.id],
    );
    const detached = await db.query(
      "update public.buildings set complex_id=null,complex_scope=null where complex_id=$1",
      [policy.id],
    );
    await db.query(
      "update public.building_complexes set published=false where id=$1 and published",
      [policy.id],
    );
    await db.query(
      "delete from private.catalog_publications where (record_type='building_complexes' and record_id=$1) or (record_type='building_towers' and record_id in(select id from public.building_towers where complex_id=$1))",
      [policy.id],
    );
    const after = (
      await db.query(
        "select * from public.buildings where id=any($1::uuid[])",
        [policy.buildingIds],
      )
    ).rows;
    const content = (b) =>
      Object.fromEntries(
        Object.entries(b).filter(
          ([k]) => !["complex_id", "complex_scope", "updated_at"].includes(k),
        ),
      );
    for (const b of before.buildings) {
      const a = after.find((a) => a.id === b.id);
      assert.equal(a.complex_id, null);
      assert.equal(a.complex_scope, null);
      assert.deepEqual(content(a), content(b));
    }
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from public.catalog_complexes where id=$1",
          [policy.id],
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from public.catalog_towers where complex_id=$1",
          [policy.id],
        )
      ).rows[0].n,
      0,
    );
    const visible = (
      await db.query(
        "select id,name,complex_id from public.catalog_buildings where id=any($1::uuid[])",
        [policy.buildingIds],
      )
    ).rows;
    assert.equal(visible.length, 3);
    assert(visible.every((b) => b.complex_id === null));
    report.push({
      name: policy.name,
      detached: detached.rowCount,
      individualBuildings: visible.map((b) => b.name),
      sourceRecordsPreserved: true,
    });
  }
  await db.query(apply ? "commit" : "rollback");
  console.log(JSON.stringify({ apply, report }, null, 2));
} catch (e) {
  await db.query("rollback");
  throw e;
} finally {
  await db.end();
}
