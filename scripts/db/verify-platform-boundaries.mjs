import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { connectDatabase } from "../building-register/vworld-client.mjs";
const db = await connectDatabase();
const migrations = [
  "202610130001_platform_data_boundaries",
  "202610130002_private_asset_operations",
  "202610130003_source_finance_boundary",
];
const preview = process.argv.includes("--preview");
async function denied(sql, args = [], pattern = /denied|permission/) {
  await db.query("savepoint denied_probe");
  let error;
  try {
    await db.query(sql, args);
  } catch (e) {
    error = e;
  }
  await db.query("rollback to savepoint denied_probe");
  assert(
    error && pattern.test(error.message),
    `Expected denial: ${error?.message ?? "none"}`,
  );
}
const checksum = async () =>
  (
    await db.query(
      `select count(*)::int n,md5(string_agg(concat_ws('|',id,building_id,period,deposit,rent,fee,noc,vacancy,rent_free,area_basis,vat_basis,source_name,source_url),E'\n' order by id)) hash from public.leasing_quarters`,
    )
  ).rows[0];
try {
  const before = await checksum();
  const versions = (
    await db.query(
      "select version from supabase_migrations.schema_migrations order by version desc limit 4",
    )
  ).rows.map((r) => r.version);
  console.log(
    JSON.stringify({
      mode: preview ? "transactional_preview" : "deployed_verification",
      latest_versions: versions,
      market_rows: before.n,
    }),
  );
  await db.query("begin");
  if (preview)
    for (const migration of migrations) {
      const sql = await readFile(
        `supabase/migrations/${migration}.sql`,
        "utf8",
      );
      await db.query(sql.replace(/^begin;\s*/, "").replace(/commit;\s*$/, ""));
    }
  assert.deepEqual(
    await checksum(),
    before,
    "original market values and source captions unchanged",
  );
  const classification = (
    await db.query(
      "select count(*)::int n from public.leasing_quarters where data_domain='market_leasing' and provider_code='rsquare' and observation_basis='market_survey'",
    )
  ).rows[0];
  assert.equal(classification.n, before.n);
  const secured = (
    await db.query(
      `select tablename,rowsecurity from pg_tables where schemaname='private' and tablename like 'igis_operation%' or schemaname='private' and tablename in ('igis_lease_contracts','igis_lease_terms','igis_operating_periods','igis_cash_entries','igis_operating_plans','igis_asset_valuations')`,
    )
  ).rows;
  assert.equal(secured.length, 9);
  assert(secured.every((r) => r.rowsecurity));
  const grants = (
    await db.query("select count(*)::int n from private.igis_operation_grants")
  ).rows[0].n;
  const member = (
    await db.query(
      "select user_id,source_member_id from private.workplace_members where enabled and source_member_id in ('14eaf982-9d0d-4243-a0b4-eb10626f690a','55f871a3-8d79-42fb-b208-9515b7b366be','809a0b49-37da-40e4-b664-8adc2eba4ad3') limit 1",
    )
  ).rows[0];
  assert(member, "existing planning member required");
  const object = (
    await db.query(
      "select id,asset_id from private.master_investment_objects where asset_id is not null order by id limit 1",
    )
  ).rows[0];
  const asset = (
    await db.query(
      "select id,existing_building_id from private.master_assets where id=$1",
      [object.asset_id],
    )
  ).rows[0];
  await db.query(
    "update private.workplace_members set verified_until=now()+interval '5 minutes' where user_id=$1",
    [member.user_id],
  );
  await db.query("set local role anon");
  await denied("select public.igis_operation_access($1)", [
    asset.existing_building_id,
  ]);
  await denied("select * from private.igis_operating_periods");
  // Public market projection still works; private tables are not a dependency.
  await db.query("select noc from public.catalog_leasing limit 1");
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
    member.user_id,
  ]);
  await denied(
    "select public.igis_operation_records('igis_operating_periods',$1)",
    [asset.id],
  );
  let context = (
    await db.query(
      "select public.data_field_context('master_investment_objects',$1) value",
      [object.id],
    )
  ).rows[0].value;
  assert(!("acquisition_noi" in context.record));
  assert(!("appraisal_amount" in context.record));
  await db.query(
    "select public.master_record_history('master_investment_objects',$1)",
    [object.id],
  );
  await db.query(
    "select public.data_field_history('master_investment_objects',$1,null,null,0)",
    [object.id],
  );
  await denied(
    "select public.master_save_record('master_investment_objects',$1,$2,'{\"acquisition_noi\":123}', 'boundary probe')",
    [object.id, context.record.revision],
  );
  await db.query(
    "select public.igis_operation_set_grant($1,$2,null,'operating_actual',true,true,null,'temporary verification grant')",
    [member.source_member_id, asset.id],
  );
  const actual = {
    period_start: "2098-01-01",
    period_end: "2098-01-31",
    currency_code: "KRW",
    accounting_basis: "accrual",
    scope_basis: "whole_asset",
    rental_revenue: "9007199254740993.123456",
    source_reference: "rollback-only verification " + randomUUID(),
  };
  const created = (
    await db.query(
      "select public.igis_operation_save('igis_operating_periods',$1,null,null,null,$2,'rollback-only verification') value",
      [asset.id, actual],
    )
  ).rows[0].value;
  assert.equal(created.rental_revenue, actual.rental_revenue);
  await denied(
    "select public.igis_operation_save('igis_operating_periods',$1,null,$2,0,'{\"note\":\"stale\"}','stale revision test')",
    [asset.id, created.id],
    /revision_conflict/,
  );
  const history = (
    await db.query(
      "select public.igis_operation_record_history('igis_operating_periods',$1) value",
      [created.id],
    )
  ).rows[0].value;
  assert.equal(history.length, 1);
  const privateReason = "private NOI verification " + randomUUID();
  context = (
    await db.query(
      "select public.data_field_context('master_investment_objects',$1) value",
      [object.id],
    )
  ).rows[0].value;
  await db.query(
    "select public.master_save_record('master_investment_objects',$1,$2,'{\"acquisition_noi\":123456789.123456}',$3)",
    [object.id, context.record.revision, privateReason],
  );
  assert(
    JSON.stringify(
      (
        await db.query(
          "select public.data_field_history('master_investment_objects',$1,null,null,0) value",
          [object.id],
        )
      ).rows[0].value,
    ).includes(privateReason),
  );
  await db.query(
    "select public.igis_operation_set_grant($1,$2,null,'operating_actual',false,false,null,'temporary grant revocation')",
    [member.source_member_id, asset.id],
  );
  await denied(
    "select public.igis_operation_record_history('igis_operating_periods',$1)",
    [created.id],
  );
  for (const query of [
    "select public.master_record_history('master_investment_objects',$1) value",
    "select public.data_field_history('master_investment_objects',$1,null,null,0) value",
  ]) {
    const result = (await db.query(query, [object.id])).rows[0].value;
    assert(
      !JSON.stringify(result).includes(privateReason),
      "private history reasons must not leak after revocation",
    );
  }
  await db.query("rollback");
  assert.deepEqual(await checksum(), before);
  if (!preview)
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from private.igis_operation_grants",
        )
      ).rows[0].n,
      grants,
    );
  console.log(
    JSON.stringify({
      ok: true,
      rolled_back: true,
      market_values_preserved: true,
      private_tables: secured.length,
      existing_grants: grants,
      checks: [
        "anonymous_denied",
        "public_market_available",
        "unscoped_member_denied",
        "legacy_finance_redacted",
        "legacy_write_guard",
        "exact_amount",
        "optimistic_revision",
        "private_history",
        "revocation",
      ],
    }),
  );
} catch (e) {
  await db.query("rollback").catch(() => {});
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
