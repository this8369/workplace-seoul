import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { connectDatabase } from "../building-register/vworld-client.mjs";
import { standaloneComplexes } from "./complex-policies.mjs";
const db = await connectDatabase();
const apply = process.argv.includes("--apply");
const complexId = process.argv
  .find((arg) => arg.startsWith("--complex="))
  ?.slice(10);
const policies = standaloneComplexes.filter(
  (p) => !complexId || p.id === complexId,
);
assert(policies.length > 0, "Unknown standalone complex");
try {
  await db.query("begin");
  const report = [];
  for (const policy of policies) {
    await db.query(
      "select set_config('app.review_origin','complex_scope_correction',true),set_config('app.review_reason',$1,true)",
      [policy.reason],
    );
    const imagesBefore = (
      await db.query(
        "select * from public.building_images where building_id=any($1::uuid[]) order by id",
        [policy.buildingIds],
      )
    ).rows;
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
        `data/private/complexes/ungroup-before-${policy.id}-${Date.now()}.json`,
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
    assert.equal(visible.length, policy.buildingIds.length);
    assert(visible.every((b) => b.complex_id === null));
    assert.deepEqual(
      (
        await db.query(
          "select * from public.building_images where building_id=any($1::uuid[]) order by id",
          [policy.buildingIds],
        )
      ).rows,
      imagesBefore,
      "Existing photos and crop settings must remain unchanged",
    );
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
