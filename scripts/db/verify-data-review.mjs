import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { connectDatabase } from "../building-register/vworld-client.mjs";

// Every probe is rolled back, including membership, requests and audit rows.
const db = await connectDatabase();
async function denied(sql, args = [], pattern = /denied/) {
  await db.query("savepoint probe");
  let error;
  try {
    await db.query(sql, args);
  } catch (e) {
    error = e;
  }
  await db.query("rollback to savepoint probe");
  assert(
    error && pattern.test(error.message),
    `Expected denial: ${error?.message || "none"}`,
  );
}
try {
  const countSql = `select (select count(*) from private.data_change_requests)::int requests,(select count(*) from private.data_record_history)::int history,(select count(*) from private.master_team_assignments)::int assignments`;
  const before = (await db.query(countSql)).rows[0];
  assert.equal(
    before.assignments,
    0,
    "HR refresh pending: no fund editors may be assigned",
  );
  const members = (
    await db.query(
      `select user_id,source_member_id,role from private.workplace_members where enabled and source_member_id in ('14eaf982-9d0d-4243-a0b4-eb10626f690a','55f871a3-8d79-42fb-b208-9515b7b366be','809a0b49-37da-40e4-b664-8adc2eba4ad3')`,
    )
  ).rows;
  assert(
    members.length >= 1,
    "at least one planning member must have signed in",
  );
  assert.equal(
    Number(
      (
        await db.query(
          "select count(*) n from private.workplace_initial_roles where role='admin' and source_member_id in ('14eaf982-9d0d-4243-a0b4-eb10626f690a','55f871a3-8d79-42fb-b208-9515b7b366be','809a0b49-37da-40e4-b664-8adc2eba4ad3')",
        )
      ).rows[0].n,
    ),
    3,
    "three planning recipients have initial roles; membership is created at first login",
  );
  const member = members[0];
  const building = (
    await db.query("select id,name from public.buildings order by id limit 1")
  ).rows[0];
  const fund = (
    await db.query("select id from private.master_vehicles order by id limit 1")
  ).rows[0];
  const registry = (
    await db.query(
      "select r.id from public.building_register_records r join public.building_register_links l on l.record_id=r.id join public.buildings b on b.id=l.building_id where l.status='verified' limit 1",
    )
  ).rows[0];
  await db.query("begin");
  await db.query(
    "update private.workplace_members set verified_until=now()+interval '5 minutes' where user_id=$1",
    [member.user_id],
  );
  await db.query("set local role anon");
  await denied("select public.data_field_context('buildings',$1)", [
    building.id,
  ]);
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
    randomUUID(),
  ]);
  await denied("select public.data_review_inbox()");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
    member.user_id,
  ]);
  let context = (
    await db.query("select public.data_field_context('buildings',$1) value", [
      building.id,
    ])
  ).rows[0].value;
  assert.equal(context.can_edit, true);
  assert.equal(
    (
      await db.query(
        "select public.data_field_context('building_register_records',$1) value",
        [registry.id],
      )
    ).rows[0].value.read_only,
    true,
  );
  await denied(
    "select public.data_save_field('building_register_records',$1,'building_name','null','\"probe\"','temporary test')",
    [registry.id],
    /official_register_read_only/,
  );
  await denied(
    "select public.data_submit_request('building_register_records',$1,'building_name','null','\"probe\"','temporary test',$2)",
    [registry.id, randomUUID()],
    /official_register_read_only/,
  );
  // Simulate a verified ordinary member without creating an account or granting lasting access.
  await db.query("reset role");
  await db.query(
    "update private.workplace_members set source_member_id=$1,role='viewer' where user_id=$2",
    [randomUUID(), member.user_id],
  );
  await db.query("set local role authenticated");
  assert.equal(
    (
      await db.query(
        "select public.data_field_context('master_vehicles',$1) value",
        [fund.id],
      )
    ).rows[0].value.can_edit,
    false,
  );
  await denied(
    "select public.data_save_field('buildings',$1,'name',$2,'\"probe\"','temporary test')",
    [building.id, JSON.stringify(context.record.name)],
  );
  const proposed = `${context.record.name} (rollback probe)`;
  const request = (
    await db.query(
      "select public.data_submit_request('buildings',$1,'name',$2,$3,'transaction-only verification',$4) id",
      [
        building.id,
        JSON.stringify(context.record.name),
        JSON.stringify(proposed),
        randomUUID(),
      ],
    )
  ).rows[0].id;
  const inbox = (await db.query("select public.data_review_inbox() value"))
    .rows[0].value;
  assert.equal(inbox.can_review, false);
  assert.equal(
    inbox.requests.find((q) => q.id === request).recipients.length,
    3,
  );
  await denied("select public.data_decide_request($1,true,$2)", [
    request,
    "ordinary member cannot approve",
  ]);
  await db.query("reset role");
  await db.query(
    "update private.workplace_members set source_member_id=$1,role=$2 where user_id=$3",
    [member.source_member_id, member.role, member.user_id],
  );
  await db.query("set local role authenticated");
  await db.query("select public.data_decide_request($1,true,$2)", [
    request,
    "transaction-only approval",
  ]);
  context = (
    await db.query("select public.data_field_context('buildings',$1) value", [
      building.id,
    ])
  ).rows[0].value;
  assert.equal(context.record.name, proposed);
  const history = (
    await db.query(
      "select public.data_field_history('buildings',$1,'name') value",
      [building.id],
    )
  ).rows[0].value.records;
  assert(history.some((h) => h.changes.name?.after === proposed));
  assert(
    history.every((h) => Object.keys(h.changes).every((k) => k === "name")),
  );
  const assetHistory = (
    await db.query(
      "select public.data_field_history(null,null,null,$1) value",
      [building.id],
    )
  ).rows[0].value;
  assert(assetHistory.records.length > 0);
  await denied("select * from private.data_change_requests");
  await denied("select * from private.data_record_history");
  await db.query("rollback");
  assert.deepEqual(
    (await db.query(countSql)).rows[0],
    before,
    "all probe data rolled back",
  );
  assert.equal(
    (
      await db.query("select name from public.buildings where id=$1", [
        building.id,
      ])
    ).rows[0].name,
    building.name,
  );
  console.log(
    JSON.stringify({
      anonymous_blocked: true,
      registered_requests: true,
      planning_recipients: 3,
      planning_members_enrolled: members.length,
      atomic_approval: true,
      scoped_history: true,
      official_register_read_only: true,
      fund_assignments: 0,
      hr_status: "awaiting_updated_hr",
      all_probes_rolled_back: true,
    }),
  );
} finally {
  await db.query("rollback").catch(() => {});
  await db.end();
}
