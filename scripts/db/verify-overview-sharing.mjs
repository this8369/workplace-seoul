import assert from "node:assert/strict";
import { connectDatabase } from "../building-register/vworld-client.mjs";
const db = await connectDatabase();
try {
  const complexes = (
    await db.query("select * from public.building_complexes where published")
  ).rows;
  const c = complexes.find((c) => c.name === "센터필드");
  const children = (
    await db.query(
      "select b.* from public.buildings b where b.complex_id=$1 and b.complex_scope='component' order by id",
      [c.id],
    )
  ).rows;
  assert.equal(children.length, 2);
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
  async function context(entity, id) {
    return (
      await db.query("select public.data_field_context($1,$2) value", [
        entity,
        id,
      ])
    ).rows[0].value;
  }
  async function save(entity, id, field, value) {
    const ctx = await context(entity, id);
    assert(ctx.can_edit);
    return (
      await db.query(
        "select public.data_save_field($1,$2,$3,$4::jsonb,$5::jsonb,$6) value",
        [
          entity,
          id,
          field,
          JSON.stringify(ctx.record[field]),
          JSON.stringify(value),
          "공통·동별 수정 검증 (롤백)",
        ],
      )
    ).rows[0].value;
  }
  for (const c of complexes) {
    assert(
      (await context("building_asset_profiles", c.representative_building_id))
        .can_edit,
    );
    assert((await context("building_complexes", c.id)).can_edit);
  }
  await save(
    "building_asset_profiles",
    c.representative_building_id,
    "owner_name",
    "공통 소유주 검증",
  );
  for (const b of children) {
    const shared = (
      await db.query(
        "select p.owner_name from public.buildings b join public.building_complexes c on c.id=b.complex_id join public.building_asset_profiles p on p.id=c.representative_building_id where b.id=$1",
        [b.id],
      )
    ).rows[0];
    assert.equal(shared.owner_name, "공통 소유주 검증");
  }
  const before = (await context("building_asset_profiles", children[1].id))
    .record;
  await save(
    "building_asset_profiles",
    children[0].id,
    "ceiling_height_m",
    "3.2",
  );
  assert.equal(
    Number(
      (await context("building_asset_profiles", children[0].id)).record
        .ceiling_height_m,
    ),
    3.2,
  );
  assert.equal(
    (await context("building_asset_profiles", children[1].id)).record
      .ceiling_height_m,
    before.ceiling_height_m,
  );
  await save("building_complexes", c.id, "parking_spaces", "900");
  assert.equal(
    Number((await context("building_complexes", c.id)).record.parking_spaces),
    900,
  );
  await db.query("rollback");
  console.log(
    JSON.stringify({
      complexes: complexes.length,
      sharedOwnerSave: true,
      independentCeilingSave: true,
      sharedParkingSave: true,
      realAuthenticatedRpc: true,
      testWritesRolledBack: true,
    }),
  );
} finally {
  await db.query("rollback").catch(() => {});
  await db.end();
}
