begin;

create extension if not exists pgaudit with schema extensions;

-- The role only tells pgAudit which objects to log. It has no login or members.
create role workplace_fund_auditor nologin noinherit;
do $$
declare relation record;
begin
  for relation in
    select tablename from pg_catalog.pg_tables
    where schemaname = 'private' and (
      tablename ~ '^(master_|igis_operation_)' or tablename in (
        'igis_lease_contracts', 'igis_lease_terms', 'igis_operating_periods',
        'igis_cash_entries', 'igis_operating_plans', 'igis_asset_valuations',
        'igis_source_field_boundaries', 'data_record_history', 'data_change_requests'
      )
    )
  loop
    execute format('grant select on private.%I to workplace_fund_auditor', relation.tablename);
  end loop;
end $$;

-- Record table and operation in administrative sessions. SQL text and its
-- parameters may contain financial values and should stay out of audit logs.
do $$
begin
  if current_setting('pgaudit.log_parameter', true) is distinct from 'off'
    or exists (
      select 1 from pg_catalog.pg_db_role_setting s cross join lateral unnest(s.setconfig) c
      where (s.setrole = 0 or s.setrole = (select oid from pg_catalog.pg_roles where rolname = 'postgres'))
        and c like 'pgaudit.log_parameter=%' and c <> 'pgaudit.log_parameter=off'
    )
  then raise exception 'pgAudit parameter logging must be disabled'; end if;
end $$;
alter role postgres set pgaudit.role = 'workplace_fund_auditor';
alter role postgres set pgaudit.log_statement = off;

commit;
