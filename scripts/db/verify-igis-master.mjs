import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { connectDatabase } from "../building-register/vworld-client.mjs";
const dir = "data/private/igis-master-20261006";
const payload = JSON.parse(
  await readFile(`${dir}/initial-import.json`, "utf8"),
);
const db = await connectDatabase();
const checks = [];
async function denied(sql, args = [], pattern = /denied/) {
  await db.query("savepoint access_probe");
  let error;
  try {
    await db.query(sql, args);
  } catch (e) {
    error = e;
  }
  await db.query("rollback to savepoint access_probe");
  assert(error && pattern.test(error.message), "expected denial");
}
try {
  for (const file of payload.files) {
    const r = (
      await db.query(
        "select original_xlsx from private.master_import_files where id=$1",
        [file.id],
      )
    ).rows[0];
    assert.equal(
      createHash("sha256").update(r.original_xlsx).digest("hex"),
      file.sha256,
    );
  }
  checks.push("6 original XLSX files: stored bytes match SHA256");
  for (const [t, rs] of Object.entries(payload.tables))
    assert.equal(
      Number((await db.query(`select count(*) n from private.${t}`)).rows[0].n),
      rs.length,
    );
  checks.push("All canonical/staging record counts match source manifest");
  const clarified = (
    await db.query(`select
    (select count(*) from private.master_beneficiary_positions where currency_code='KRW' and currency_status='inferred_krw_cross_report') beneficiaries,
    (select count(*) from private.master_aum_snapshots where business_as_of is null and business_as_of_status='not_provided' and entered_on_interpretation='system_entry_date_provisional') aum,
    (select count(*) from private.master_review_issues where issue_kind='aum_cross_report_observation' and severity='information') observations`)
  ).rows[0];
  assert.equal(Number(clarified.beneficiaries), 1125);
  assert.equal(Number(clarified.aum), 902);
  assert.equal(Number(clarified.observations), 212);
  checks.push(
    "Currency inference and provisional AUM date interpretation stored; cross-report differences are informational",
  );
  const totalBefore = Number(
    (await db.query("select count(*) n from private.master_change_history"))
      .rows[0].n,
  );
  const member = (
    await db.query(
      "select user_id from private.workplace_members where role='admin' and enabled order by user_id limit 1",
    )
  ).rows[0];
  assert(
    member,
    "registered admin required for rolled-back positive permission test",
  );
  const fund = (
    await db.query(
      "select id,revision,name from private.master_vehicles order by id limit 1",
    )
  ).rows[0];
  await db.query("begin");
  // This transaction is always rolled back; no session or user role is changed permanently.
  await db.query(
    "update private.workplace_members set verified_until=now()+interval '2 minutes' where user_id=$1",
    [member.user_id],
  );
  await db.query("set local role anon");
  for (const t of Object.keys(payload.tables))
    await denied(`select * from private.${t} limit 1`);
  await denied("select public.master_list_records('master_vehicles')");
  await denied("select public.master_query_records('master_vehicles')");
  await denied(
    "select public.master_asset_corrections('00000000-0000-0000-0000-000000000001')",
  );
  checks.push("Anonymous direct tables and master RPCs denied");
  await db.query("set local role authenticated");
  await db.query(
    "select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true)",
  );
  await denied("select public.master_query_records('master_vehicles')");
  checks.push("Unregistered authenticated user denied");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
    member.user_id,
  ]);
  const list = (
    await db.query(
      "select public.master_query_records('master_vehicles','',30,0,$1,null) value",
      [fund.id],
    )
  ).rows[0].value;
  assert.equal(list.records.length, 1);
  assert.equal(list.records[0].id, fund.id);
  const saved = (
    await db.query(
      "select public.master_save_record('master_vehicles',$1,$2,$3,'transaction-only verification') value",
      [
        fund.id,
        fund.revision,
        { name: fund.name + " (temporary verification)" },
      ],
    )
  ).rows[0].value;
  assert.equal(saved.revision, Number(fund.revision) + 1);
  const history = (
    await db.query(
      "select public.master_record_history('master_vehicles',$1) value",
      [fund.id],
    )
  ).rows[0].value;
  assert.equal(history[0].changed_by, member.user_id);
  assert.equal(history[0].before_record.name, fund.name);
  assert.equal(history[0].after_record.name, saved.name);
  await denied(
    "select public.master_save_record('master_vehicles',$1,$2,$3,'stale verification')",
    [fund.id, fund.revision, { name: "stale" }],
    /revision_conflict/,
  );
  checks.push(
    "Registered admin: exact relationship read, MY edit, actor/before/after history, stale revision rejected",
  );
  const asset = (
    await db.query("select public.master_query_records('master_assets') value")
  ).rows[0].value.records.find((a) => a.existing_building_id);
  assert(asset);
  await db.query(
    "select public.master_save_record('master_assets',$1,$2,$3,'transaction-only detail correction')",
    [asset.id, asset.revision, { description: "temporary member detail" }],
  );
  const corrections = (
    await db.query("select public.master_asset_corrections($1) value", [
      asset.existing_building_id,
    ])
  ).rows[0].value;
  assert.equal(corrections.asset.description, "temporary member detail");
  assert(corrections.edited_fields.includes("description"));
  checks.push(
    "MY corrections are available to member details without replacing unrelated original fields",
  );
  await db.query("reset role");
  await db.query(
    "update private.workplace_members set verified_until=now()-interval '1 second' where user_id=$1",
    [member.user_id],
  );
  await db.query("set local role authenticated");
  await denied("select public.master_query_records('master_vehicles')");
  await denied(
    "select public.master_save_record('master_vehicles',$1,$2,$3,'expired verification')",
    [fund.id, saved.revision, { name: "expired" }],
  );
  checks.push("Expired membership: master read/write denied");
  await db.query("rollback");
  assert.equal(
    Number(
      (await db.query("select count(*) n from private.master_change_history"))
        .rows[0].n,
    ),
    totalBefore,
  );
  assert.equal(
    (
      await db.query("select name from private.master_vehicles where id=$1", [
        fund.id,
      ])
    ).rows[0].name,
    fund.name,
  );
  checks.push(
    "Verification rolled back: canonical records and audit count unchanged",
  );
  const result = { at: new Date().toISOString(), checks };
  await writeFile(
    `${dir}/production-verification.json`,
    JSON.stringify(result, null, 2),
    { mode: 0o600 },
  );
  console.log(checks.join("\n"));
} finally {
  await db.query("rollback").catch(() => {});
  await db.end();
}
