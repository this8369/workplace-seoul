import assert from "node:assert/strict";
import { connectDatabase } from "../building-register/vworld-client.mjs";
const db = await connectDatabase();
try {
  await db.query("begin");
  const member = (
    await db.query(
      "select user_id from private.workplace_members where source_member_id='809a0b49-37da-40e4-b664-8adc2eba4ad3' and enabled limit 1",
    )
  ).rows[0];
  assert(member, "Verified owner account required");
  const record = (
    await db.query(
      "select id from public.buildings where typical_floor_exclusive_pyeong is null and (typical_floor_rentable_pyeong is null or typical_floor_rentable_pyeong >= 900) limit 1",
    )
  ).rows[0];
  assert(record, "Missing area fixture required");
  await db.query(
    "update private.workplace_members set verified_until=now()+interval '5 minutes' where user_id=$1",
    [member.user_id],
  );
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
    member.user_id,
  ]);
  const context = (
    await db.query(
      "select public.data_field_context('buildings',$1) value",
      [record.id],
    )
  ).rows[0].value;
  assert.equal(
    context.fields.find((f) => f.key === "typical_floor_exclusive_pyeong")
      .value,
    null,
  );
  const saved = (
    await db.query(
      "select public.data_save_field('buildings',$1,'typical_floor_exclusive_pyeong',$2,$3,'계획') value",
      [record.id, null, '"900"'],
    )
  ).rows[0].value;
  assert.equal(Number(saved.typical_floor_exclusive_pyeong), 900);
  const timeline = async () =>
    (
      await db.query(
        "select public.data_field_history('buildings',$1,'typical_floor_exclusive_pyeong') value",
        [record.id],
      )
    ).rows[0].value;
  const history = await timeline();
  assert.equal(history.can_delete, true);
  const h = history.records.find(
    (h) => h.reason === "계획",
  );
  assert(h);
  await db.query("select public.data_set_history_deleted($1,true)", [h.id]);
  assert(!(await timeline()).records.some((r) => r.id === h.id));
  await db.query("select public.data_set_history_deleted($1,false)", [h.id]);
  assert((await timeline()).records.some((r) => r.id === h.id));
  await db.query("reset role");
  // Roll back identity changes and every test edit; no real asset values are retained.
  await db.query(
    "update private.workplace_members set source_member_id='14eaf982-9d0d-4243-a0b4-eb10626f690a',display_name='전기영' where user_id=$1",
    [member.user_id],
  );
  await db.query("set local role authenticated");
  assert.equal((await timeline()).can_delete, false);
  await db.query("savepoint denied_probe");
  await assert.rejects(
    () => db.query("select public.data_set_history_deleted($1,true)", [h.id]),
    /history_delete_denied/,
  );
  await db.query("rollback to savepoint denied_probe");
  await db.query("rollback");
  assert.equal(
    (
      await db.query(
        "select typical_floor_exclusive_pyeong from public.buildings where id=$1",
        [record.id],
      )
    ).rows[0].typical_floor_exclusive_pyeong,
    null,
  );
  console.log(
    "PASS: live DB short-reason null area save, owner delete/restore, other admin denied; all probes rolled back",
  );
} finally {
  await db.query("rollback").catch(() => {});
  await db.end();
}
