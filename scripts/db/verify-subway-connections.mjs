import assert from "node:assert/strict";
import { connectDatabase } from "../building-register/vworld-client.mjs";
import { prepareSubwayConnections } from "../../src/lib/asset-overview.ts";
import { stationLines } from "../../src/lib/subway-stations.ts";

const db = await connectDatabase();
try {
  await db.query("begin");
  const member = (
    await db.query(
      "select user_id from private.workplace_members where source_member_id='809a0b49-37da-40e4-b664-8adc2eba4ad3' and enabled limit 1",
    )
  ).rows[0];
  assert(member, "A verified editor is required");
  const asset = (
    await db.query(
      "select coalesce(c.representative_building_id,b.id) id from buildings b left join building_complexes c on c.id=b.complex_id where b.name ilike '%IFC%' limit 1",
    )
  ).rows[0];
  assert(asset);
  await db.query(
    "update private.workplace_members set verified_until=now()+interval '5 minutes' where user_id=$1",
    [member.user_id],
  );
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
    member.user_id,
  ]);
  const context = async () =>
    (
      await db.query(
        "select public.data_field_context('building_asset_profiles',$1) value",
        [asset.id],
      )
    ).rows[0].value;
  const before = await context();
  assert(before.can_edit);
  const rows = [
    {
      station_name: "여의도역",
      lines: stationLines("여의도"),
      direct_connection: true,
    },
    { station_name: "", lines: [], direct_connection: null },
  ];
  // Ensure this exercises a write even if this station was already registered.
  rows[0].direct_connection =
    !before.record.subway_connections?.[0]?.direct_connection;
  const save = (proposed) =>
    db.query(
      "select public.data_save_field('building_asset_profiles',$1,'subway_connections',$2::jsonb,$3::jsonb,$4)",
      [
        asset.id,
        JSON.stringify(before.record.subway_connections),
        JSON.stringify(proposed),
        "지하철 입력 저장 검증 (롤백)",
      ],
    );
  await db.query("savepoint blank_row");
  await assert.rejects(() => save(rows), /invalid_subway_connection/);
  await db.query("rollback to savepoint blank_row");
  const prepared = prepareSubwayConnections(rows);
  await save(prepared);
  assert.deepEqual((await context()).record.subway_connections, prepared);
  await db.query("rollback");
  console.log(
    JSON.stringify({
      authenticatedSave: true,
      blankRowCauseConfirmed: true,
      autoTransferLines: true,
      testWritesRolledBack: true,
    }),
  );
} finally {
  await db.query("rollback").catch(() => {});
  await db.end();
}
