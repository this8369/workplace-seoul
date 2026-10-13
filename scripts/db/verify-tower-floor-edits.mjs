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
  const towers = (
    await db.query(
      "select t.id,t.label,t.typical_floor_exclusive_pyeong,t.typical_floor_rentable_pyeong from public.building_towers t join public.building_complexes c on c.id=t.complex_id where c.name='서리풀' and t.parent_tower_id is null and t.component_kind<>'facility' order by t.sort_order",
    )
  ).rows;
  assert.equal(towers.length, 2);
  await db.query(
    "update private.workplace_members set verified_until=now()+interval '5 minutes' where user_id=$1",
    [member.user_id],
  );
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
    member.user_id,
  ]);
  for (const t of towers) {
    await db.query("savepoint tower_probe");
    try {
      const context = (
        await db.query(
          "select public.data_field_context('building_towers',$1) value",
          [t.id],
        )
      ).rows[0].value;
      const result = (
        await db.query(
          "select public.data_save_field('building_towers',$1,'typical_floor_exclusive_pyeong',$2,$3,'ㅇ') value",
          [
            t.id,
            JSON.stringify(context.record.typical_floor_exclusive_pyeong),
            '"600"',
          ],
        )
      ).rows[0].value;
      assert.equal(Number(result.typical_floor_exclusive_pyeong), 600);
      const evidence =
        result.evidence.manual_floor_edits.typical_floor_exclusive_pyeong;
      assert.equal(evidence.edited_by, member.user_id);
      assert.equal(evidence.reason, "ㅇ");
      assert.equal(result.source_url, context.record.source_url);
      assert.equal(result.content_hash, context.record.content_hash);
      const history = (
        await db.query(
          "select public.data_field_history('building_towers',$1,'typical_floor_exclusive_pyeong') value",
          [t.id],
        )
      ).rows[0].value.records;
      assert(
        history.some(
          (h) =>
            h.reason === "ㅇ" &&
            h.changes.typical_floor_exclusive_pyeong.after === "600",
        ),
      );
      const other = towers.find((row) => row.id !== t.id);
      const otherValue = (
        await db.query(
          "select public.data_field_context('building_towers',$1) value",
          [other.id],
        )
      ).rows[0].value.record.typical_floor_exclusive_pyeong;
      assert.equal(
        otherValue,
        other.typical_floor_exclusive_pyeong,
        "Other tower must remain unchanged",
      );
      console.log(JSON.stringify({ tower: t.label, saved: true }));
    } catch (e) {
      if (!process.argv.includes("--diagnose")) throw e;
      console.log(
        JSON.stringify({
          tower: t.label,
          error: e.message,
          constraint: e.constraint,
        }),
      );
    }
    await db.query("rollback to savepoint tower_probe");
  }
  await db.query("rollback");
  if (!process.argv.includes("--diagnose"))
    console.log(
      "PASS: actual Seripul south/north floor edits; all probes rolled back",
    );
} finally {
  await db.query("rollback").catch(() => {});
  await db.end();
}
