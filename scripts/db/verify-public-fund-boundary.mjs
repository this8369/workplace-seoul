import assert from "node:assert/strict";
import { connectDatabase } from "../building-register/vworld-client.mjs";
import { igisSampleApiSql } from "./igis-sample-api.mjs";

const demoSql = igisSampleApiSql();
const demoBodies = new Map(
  [
    ...demoSql.matchAll(
      /^create or replace function public\.([a-z_]+)\([\s\S]*? as \$\$([\s\S]*?)\$\$;/gm,
    ),
  ].map(([, name, body]) => [name, body]),
);

const db = await connectDatabase();
try {
  await db.query("begin read only");
  assert.equal(
    (
      await db.query(
        "select 1 from supabase_migrations.schema_migrations where version='202611110001'",
      )
    ).rowCount,
    1,
  );
  const { rows: exposed } = await db.query(`
    select role.name as role, p.proname as entry_point, p.prosrc as body
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    cross join (values ('anon'),('authenticated'),('service_role')) role(name)
    where n.nspname='public' and p.proname ~ '^(master_|igis_operation_|has_master_permission$)'
      and p.proname <> 'master_asset_corrections'
      and has_function_privilege(role.name,p.oid,'EXECUTE')
    union all
    select role.name, c.relname, null::text
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    cross join (values ('anon'),('authenticated'),('service_role')) role(name)
    where n.nspname='private' and c.relkind in ('r','p')
      and (c.relname ~ '^(master_|igis_operation_)'
        or c.relname in ('igis_lease_contracts','igis_lease_terms','igis_operating_periods',
          'igis_cash_entries','igis_operating_plans','igis_asset_valuations',
          'igis_source_field_boundaries','data_record_history','data_change_requests'))
      and (not c.relrowsecurity or has_any_column_privilege(role.name,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')
        or has_table_privilege(role.name,c.oid,'DELETE,TRUNCATE,TRIGGER'))
  `);
  const sampleEndpoints = exposed.filter(
    ({ role, entry_point, body }) =>
      role === "authenticated" && demoBodies.get(entry_point) === body,
  );
  assert.deepEqual(
    exposed
      .filter((entry) => !sampleEndpoints.includes(entry))
      .map(({ role, entry_point }) => ({ role, entry_point })),
    [],
    "API roles may only execute the known synthetic fixture functions",
  );
  if (sampleEndpoints.length) {
    const expected = demoSql.match(
      /function private\.igis_sample_rows\(\)[\s\S]*? as \$fn\$([\s\S]*?)\$fn\$;/,
    )?.[1];
    const {
      rows: [sample],
    } = await db.query(`select prosrc as body from pg_proc
      where oid=to_regprocedure('private.igis_sample_rows()')`);
    assert(
      expected && sample?.body === expected,
      "Fund sample function must contain only the known fixture",
    );
  }
  assert.equal(
    (
      await db.query(`
    select public.has_master_permission('master.read') allowed
  `)
    ).rows[0].allowed,
    false,
  );
  const {
    rows: [audit],
  } = await db.query(`
    select exists(select 1 from pg_extension where extname='pgaudit') as installed,
      exists(select 1 from pg_roles where rolname='workplace_fund_auditor'
        and not rolcanlogin and not rolinherit) as logging_role,
      exists(select 1 from pg_roles where rolname='postgres' and rolconfig @>
        array['pgaudit.role=workplace_fund_auditor','pgaudit.log_statement=off']) as audit_configured,
      current_setting('pgaudit.log_parameter',true)='off' as no_parameter_logging,
      current_setting('log_connections')='on' as connection_logging,
      current_setting('log_disconnections')='on' as disconnection_logging
  `);
  assert(
    Object.values(audit).every((enabled) => enabled),
    JSON.stringify(audit),
  );
  await db.query("set local role anon");
  assert.equal(
    (await db.query("select id from public.catalog_buildings limit 1"))
      .rowCount,
    1,
  );
  assert.equal(
    (await db.query("select id from public.detail_buildings limit 1")).rowCount,
    1,
  );
  console.log(
    "Public catalog and details available. Real fund access denied for API roles. Fund audit and connection logging configured.",
  );
} finally {
  await db.query("rollback").catch(() => {});
  await db.end();
}
