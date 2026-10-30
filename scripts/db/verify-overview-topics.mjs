import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { connectDatabase } from "../building-register/vworld-client.mjs";
const db = await connectDatabase();
try {
  const before = JSON.parse(
    await readFile(
      "data/private/asset-overview/overview-topics-before.json",
      "utf8",
    ),
  );
  const after = (
    await db.query(
      "select * from public.building_facts where id=any($1::uuid[])",
      [before.map((x) => x.id)],
    )
  ).rows;
  assert.equal(after.length, before.length);
  for (const old of before) {
    const row = after.find((x) => x.id === old.id);
    for (const key of [
      "field_key",
      "value",
      "unit",
      "building_id",
      "source_name",
      "source_url",
    ])
      assert.deepEqual(row[key], old[key], `${old.id}: ${key}`);
  }
  const {
    rows: [counts],
  } = await db.query(`select
    (select count(*)::int from public.building_facts where overview_enabled) items,
    (select count(distinct coalesce(complex_id,building_id))::int from public.building_facts where overview_enabled) assets,
    (select count(*)::int from public.asset_overview_topics where entity is null) custom_topics,
    (select count(*)::int from public.building_facts f join public.asset_overview_topics t on t.code=f.overview_topic_code where f.overview_enabled and t.entity is not null) standard_duplicates`);
  assert(counts.items > 0);
  assert.equal(counts.assets, 9);
  assert.equal(counts.standard_duplicates, 0);
  const targets = (
    await db.query(
      "select distinct coalesce(c.representative_building_id,f.building_id) id from public.building_facts f left join public.building_complexes c on c.id=f.complex_id where f.overview_enabled",
    )
  ).rows;
  const fields = async (id) =>
    (await db.query("select public.asset_overview_fields($1) v", [id])).rows[0]
      .v;
  await db.query("begin");
  try {
    const {
      rows: [member],
    } = await db.query(
      "select user_id from private.workplace_members where source_member_id='809a0b49-37da-40e4-b664-8adc2eba4ad3' and enabled limit 1",
    );
    assert(member, "Existing steward account required");
    await db.query(
      "update private.workplace_members set verified_until=now()+interval '5 minutes' where user_id=$1",
      [member.user_id],
    );
    const {
      rows: [complex],
    } = await db.query(
      "select c.id,c.representative_building_id from public.building_complexes c where c.published and exists(select 1 from public.building_facts f where f.complex_id=c.id and f.overview_enabled) order by c.name limit 1",
    );
    const siblings = (
      await db.query("select id from public.buildings where complex_id=$1", [
        complex.id,
      ])
    ).rows;
    await db.query("set local role anon");
    for (const t of targets) assert((await fields(t.id)).items.length > 0);
    const publicData = await fields(complex.representative_building_id);
    for (const sibling of siblings)
      assert.deepEqual((await fields(sibling.id)).items, publicData.items);
    await db.query("reset role");
    for (const table of [
      "asset_overview_topics",
      "asset_overview_topic_aliases",
    ]) {
      const {
        rows: [privilege],
      } = await db.query(
        "select has_table_privilege('anon',$1,'select') exposed,has_table_privilege('authenticated',$1,'insert') writable",
        [`public.${table}`],
      );
      assert.equal(privilege.exposed, false);
      assert.equal(privilege.writable, false);
    }
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
      member.user_id,
    ]);
    const topic = `검증 전용 ${crypto.randomUUID()}`;
    const add = async (name, value) =>
      (
        await db.query(
          "select public.asset_overview_add_item($1,$2,$3,'개','검증 후 전체 롤백') v",
          [siblings[0].id, name, JSON.stringify(value)],
        )
      ).rows[0].v;
    const added = await add(topic, 2);
    assert.equal(added.building_id, complex.representative_building_id);
    assert.equal((await add(topic.replaceAll(" ", ""), 2)).id, added.id);
    const context = (
      await db.query(
        "select public.data_field_context('building_facts',$1) v",
        [added.id],
      )
    ).rows[0].v;
    assert.equal(context.can_edit, true);
    assert.equal(context.record.value, 2);
    await db.query(
      "select public.data_save_field('building_facts',$1,'value','2','3','검증 후 롤백')",
      [added.id],
    );
    for (const sibling of siblings)
      assert.equal(
        (await fields(sibling.id)).items.find((x) => x.id === added.id).value,
        3,
      );
    const history = (
      await db.query(
        "select public.data_field_history('building_facts',$1,'value',$2,0) v",
        [added.id, siblings.at(-1).id],
      )
    ).rows[0].v;
    assert(history.records.some((h) => h.changes.value?.after === "3"));
    await db.query("savepoint duplicate_check");
    await assert.rejects(() => add(topic, 4), /overview_item_exists/);
    await db.query("rollback to savepoint duplicate_check");
    await db.query("savepoint builtin_check");
    await assert.rejects(
      () => add("기준층 전용 면적", 4),
      /overview_standard_topic/,
    );
    await db.query("rollback to savepoint builtin_check");
  } finally {
    await db.query("rollback");
  }
  const sample = (
    await db.query(
      "select id from public.buildings where name='원그로브' limit 1",
    )
  ).rows[0];
  const data = await fields(sample.id);
  await writeFile(
    "/tmp/workplace-overview-topics-public.json",
    JSON.stringify({ ...data, assetId: sample.id }),
  );
  console.log(
    JSON.stringify({
      preserved_source_records: after.length,
      ...counts,
      shared_edit_and_history: true,
      duplicate_prevention: true,
      verification_writes_rolled_back: true,
    }),
  );
} finally {
  await db.end();
}
