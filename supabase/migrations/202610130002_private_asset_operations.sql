begin;
-- New confidential data is isolated from every catalog/master/review endpoint.
-- Identity comes from server-attested IGIS membership, never a display name/email.
create table private.igis_operation_grants (
 id uuid primary key default gen_random_uuid(), source_member_id uuid not null,
 asset_id uuid references private.master_assets(id), vehicle_id uuid references private.master_vehicles(id),
 domain text not null check(domain in ('lease_contract','operating_actual','operating_plan','valuation')),
 can_read boolean not null default true, can_write boolean not null default false,
 valid_from timestamptz not null default now(), valid_until timestamptz,
 granted_by uuid references auth.users(id), granted_at timestamptz not null default now(), reason text not null,
 check(num_nonnulls(asset_id,vehicle_id)=1), check(not can_write or can_read),
 check(valid_until is null or valid_until>valid_from),check(length(trim(reason))>=3)
);
create unique index igis_operation_grant_scope on private.igis_operation_grants(source_member_id,asset_id,vehicle_id,domain) nulls not distinct;
create table private.igis_operation_history (
 id bigint generated always as identity primary key, entity text not null, record_id uuid not null,
 asset_id uuid not null, vehicle_id uuid, domain text not null,
 before_record jsonb, after_record jsonb not null, changed_by uuid references auth.users(id),
 changed_at timestamptz not null default now(), reason text not null
);
create index on private.igis_operation_history(asset_id,domain,id desc);
create table private.igis_operation_grant_history (
 id bigint generated always as identity primary key, grant_id uuid not null,
 before_record jsonb, after_record jsonb not null, changed_by uuid references auth.users(id),
 changed_at timestamptz not null default now()
);
create table private.igis_lease_contracts (
 id uuid primary key default gen_random_uuid(),
 asset_id uuid not null references private.master_assets(id),
 vehicle_id uuid references private.master_vehicles(id),
 source_row_id uuid references private.master_source_rows(id),
 source_reference text not null check(length(trim(source_reference))>0),
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id), note text,
 tenant_party_id uuid references private.master_parties(id),
 unit_id uuid references private.master_asset_units(id),
 contract_reference text not null, signed_on date, started_on date not null, ended_on date,
 status text not null check(status in ('signed','active','ended','cancelled')),
 check(ended_on is null or ended_on>=started_on),
 unique(asset_id,contract_reference)
);
create index on private.igis_lease_contracts(asset_id,vehicle_id);
create table private.igis_lease_terms (
 id uuid primary key default gen_random_uuid(),
 asset_id uuid not null references private.master_assets(id),
 vehicle_id uuid references private.master_vehicles(id),
 source_row_id uuid references private.master_source_rows(id),
 source_reference text not null check(length(trim(source_reference))>0),
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id), note text,
 contract_id uuid not null references private.igis_lease_contracts(id),
 effective_from date not null, effective_to date,
 currency_code text not null check(currency_code ~ '^[A-Z]{3}$'),
 leased_area_m2 numeric(30,6) check(leased_area_m2>0),
 area_basis text not null check(area_basis in ('rentable','exclusive','other','unconfirmed')),
 deposit_amount numeric(30,6) check(deposit_amount>=0),
 monthly_rent_amount numeric(30,6) check(monthly_rent_amount>=0),
 monthly_management_fee numeric(30,6) check(monthly_management_fee>=0),
 vat_basis text not null check(vat_basis in ('included','excluded','exempt','unconfirmed')),
 rent_free_months numeric(12,6) check(rent_free_months>=0),
 rent_free_basis text check(rent_free_basis in ('per_year','contract_total','other','unconfirmed')),
 check(rent_free_months is null or rent_free_basis is not null),
 check(effective_to is null or effective_to>effective_from),
 unique(contract_id,effective_from)
);
create index on private.igis_lease_terms(asset_id,vehicle_id);
create table private.igis_operating_periods (
 id uuid primary key default gen_random_uuid(),
 asset_id uuid not null references private.master_assets(id),
 vehicle_id uuid references private.master_vehicles(id),
 source_row_id uuid references private.master_source_rows(id),
 source_reference text not null check(length(trim(source_reference))>0),
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id), note text,
 period_start date not null, period_end date not null,
 currency_code text not null check(currency_code ~ '^[A-Z]{3}$'),
 accounting_basis text not null check(accounting_basis in ('accrual','cash')),
 scope_basis text not null check(scope_basis in ('whole_asset','fund_share')),
 rental_revenue numeric(30,6), management_revenue numeric(30,6), other_revenue numeric(30,6),
 operating_expense numeric(30,6), noi_amount numeric(30,6), noi_definition text,
 capital_expenditure numeric(30,6), rent_receivable numeric(30,6), deposit_liability numeric(30,6),
 occupied_area_m2 numeric(30,6) check(occupied_area_m2>=0),
 rentable_area_m2 numeric(30,6) check(rentable_area_m2>=0),
 check(occupied_area_m2 is null or rentable_area_m2 is null or occupied_area_m2<=rentable_area_m2),
 check(noi_amount is null or nullif(trim(noi_definition),'') is not null),
 check(period_end>=period_start),check((scope_basis='whole_asset' and vehicle_id is null) or (scope_basis='fund_share' and vehicle_id is not null)),
 unique nulls not distinct(asset_id,vehicle_id,period_start,period_end,currency_code,accounting_basis,scope_basis)
);
create index on private.igis_operating_periods(asset_id,vehicle_id);
create table private.igis_cash_entries (
 id uuid primary key default gen_random_uuid(),
 asset_id uuid not null references private.master_assets(id),
 vehicle_id uuid references private.master_vehicles(id),
 source_row_id uuid references private.master_source_rows(id),
 source_reference text not null check(length(trim(source_reference))>0),
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id), note text,
 contract_id uuid references private.igis_lease_contracts(id),
 transaction_reference text not null, occurred_on date not null,
 currency_code text not null check(currency_code ~ '^[A-Z]{3}$'),
 direction text not null check(direction in ('in','out')),
 category text not null check(category in ('rent','management_fee','deposit','operating_expense','capex','other')),
 amount numeric(30,6) not null check(amount>=0),
 reverses_id uuid references private.igis_cash_entries(id),
 unique(asset_id,transaction_reference,direction,category,currency_code)
);
create index on private.igis_cash_entries(asset_id,vehicle_id);
create table private.igis_operating_plans (
 id uuid primary key default gen_random_uuid(),
 asset_id uuid not null references private.master_assets(id),
 vehicle_id uuid references private.master_vehicles(id),
 source_row_id uuid references private.master_source_rows(id),
 source_reference text not null check(length(trim(source_reference))>0),
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id), note text,
 scenario_name text not null, version_no integer not null check(version_no>0),
 plan_kind text not null check(plan_kind in ('budget','forecast')),
 period_start date not null,period_end date not null,
 currency_code text not null check(currency_code ~ '^[A-Z]{3}$'),
 scope_basis text not null check(scope_basis in ('whole_asset','fund_share')),
 rental_revenue numeric(30,6), operating_expense numeric(30,6), noi_amount numeric(30,6), noi_definition text,
 assumptions text not null,
 check(noi_amount is null or nullif(trim(noi_definition),'') is not null),
 check(period_end>=period_start),check((scope_basis='whole_asset' and vehicle_id is null) or (scope_basis='fund_share' and vehicle_id is not null)),
 unique nulls not distinct(asset_id,vehicle_id,scenario_name,version_no,plan_kind,period_start,period_end,currency_code,scope_basis)
);
create index on private.igis_operating_plans(asset_id,vehicle_id);
create table private.igis_asset_valuations (
 id uuid primary key default gen_random_uuid(),
 asset_id uuid not null references private.master_assets(id),
 vehicle_id uuid references private.master_vehicles(id),
 source_row_id uuid references private.master_source_rows(id),
 source_reference text not null check(length(trim(source_reference))>0),
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id), note text,
 valued_on date not null,currency_code text not null check(currency_code ~ '^[A-Z]{3}$'),
 value_kind text not null check(value_kind in ('appraisal','book','market_estimate','target_sale')),
 amount numeric(30,6) not null check(amount>=0),
 valuer_party_id uuid references private.master_parties(id),method text not null,
 scope_basis text not null check(scope_basis in ('whole_asset','fund_share')),
 check((scope_basis='whole_asset' and vehicle_id is null) or (scope_basis='fund_share' and vehicle_id is not null))
);
create index on private.igis_asset_valuations(asset_id,vehicle_id);

create function private.igis_operation_domain(entity text) returns text language sql immutable set search_path='' as $$
 select case entity when 'igis_lease_contracts' then 'lease_contract' when 'igis_lease_terms' then 'lease_contract'
 when 'igis_operating_periods' then 'operating_actual' when 'igis_cash_entries' then 'operating_actual'
 when 'igis_operating_plans' then 'operating_plan' when 'igis_asset_valuations' then 'valuation' end
$$;
create function private.igis_operation_allowed(asset_key uuid,vehicle_key uuid,domain_key text,writing boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(public.has_workplace_permission('details.read') and exists(
 select 1 from private.workplace_members m join private.igis_operation_grants g on g.source_member_id=m.source_member_id
 where m.user_id=auth.uid() and m.enabled and m.verified_until>now() and g.domain=domain_key
 and g.can_read and (not writing or g.can_write) and g.valid_from<=now() and (g.valid_until is null or g.valid_until>now())
 and (g.asset_id=asset_key or g.vehicle_id=vehicle_key and exists(
 select 1 from private.master_investments i join private.master_investment_objects o on o.id=i.object_id
 where i.vehicle_id=vehicle_key and o.asset_id=asset_key and i.resolution_status in ('verified','source_name_unique','verified_source_evidence') and o.resolution_status in ('verified','verified_source_evidence')))),false)
$$;
create function private.igis_operation_json(r jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_object_agg(key,case when jsonb_typeof(value)='number' then to_jsonb(value#>>'{}') else value end) from jsonb_each(r)
$$;
create function private.igis_operation_audit() returns trigger language plpgsql security definer set search_path='' as $$
declare old_row jsonb; r jsonb; parent_row jsonb; why text;
begin
 if tg_op='DELETE' then raise exception 'operation_delete_denied';end if;
 why=nullif(trim(current_setting('app.igis_operation_reason',true)),'');
 if why is null or length(why)<3 then raise exception 'operation_reason_required';end if;
 if tg_op='UPDATE' then
  old_row=to_jsonb(old);
  if new.id<>old.id or new.asset_id<>old.asset_id or new.vehicle_id is distinct from old.vehicle_id or new.created_at<>old.created_at or new.source_row_id is distinct from old.source_row_id then raise exception 'operation_scope_immutable';end if;
  new.revision=old.revision+1;
 end if;
 if new.vehicle_id is not null and not exists(select 1 from private.master_investments i join private.master_investment_objects o on o.id=i.object_id where i.vehicle_id=new.vehicle_id and o.asset_id=new.asset_id and i.resolution_status in ('verified','source_name_unique','verified_source_evidence') and o.resolution_status in ('verified','verified_source_evidence')) then raise exception 'operation_fund_asset_mismatch';end if;
 new.updated_at=now();new.updated_by=auth.uid();r=to_jsonb(new);
 if r->>'contract_id' is not null then
  select to_jsonb(c) into parent_row from private.igis_lease_contracts c where id=(r->>'contract_id')::uuid;
  if parent_row is null or parent_row->>'asset_id'<>r->>'asset_id' or parent_row->>'vehicle_id' is distinct from r->>'vehicle_id' then raise exception 'operation_contract_scope_mismatch';end if;
 end if;
 if tg_table_name='igis_lease_contracts' and r->>'unit_id' is not null and not exists(select 1 from private.master_asset_units u where u.id=(r->>'unit_id')::uuid and u.asset_id=new.asset_id) then raise exception 'operation_unit_scope_mismatch';end if;
 if tg_table_name='igis_lease_terms' then
  perform 1 from private.igis_lease_contracts where id=new.contract_id for update;
  if exists(select 1 from private.igis_lease_terms t where t.contract_id=new.contract_id and t.id<>new.id and t.effective_from<coalesce(new.effective_to,'infinity'::date) and new.effective_from<coalesce(t.effective_to,'infinity'::date)) then raise exception 'operation_term_overlap';end if;
 end if;
 if tg_table_name='igis_cash_entries' and r->>'reverses_id' is not null then
  if not exists(select 1 from private.igis_cash_entries t where t.id=(r->>'reverses_id')::uuid and t.id<>new.id and t.asset_id=new.asset_id and t.vehicle_id is not distinct from new.vehicle_id and t.currency_code=new.currency_code and t.direction<>new.direction) then raise exception 'operation_reversal_mismatch';end if;
 end if;
 insert into private.igis_operation_history(entity,record_id,asset_id,vehicle_id,domain,before_record,after_record,changed_by,reason)
 values(tg_table_name,new.id,new.asset_id,new.vehicle_id,private.igis_operation_domain(tg_table_name),old_row,to_jsonb(new),auth.uid(),why);
 return new;
end $$;
create function private.igis_grant_audit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'grant_delete_denied';end if;
 insert into private.igis_operation_grant_history(grant_id,before_record,after_record,changed_by)
 values(new.id,case when tg_op='UPDATE' then to_jsonb(old) end,to_jsonb(new),auth.uid());return new;
end $$;
create trigger igis_grant_audit after insert or update or delete on private.igis_operation_grants for each row execute function private.igis_grant_audit();
create trigger operation_audit before insert or update or delete on private.igis_lease_contracts for each row execute function private.igis_operation_audit();
create trigger operation_audit before insert or update or delete on private.igis_lease_terms for each row execute function private.igis_operation_audit();
create trigger operation_audit before insert or update or delete on private.igis_operating_periods for each row execute function private.igis_operation_audit();
create trigger operation_audit before insert or update or delete on private.igis_cash_entries for each row execute function private.igis_operation_audit();
create trigger operation_audit before insert or update or delete on private.igis_operating_plans for each row execute function private.igis_operation_audit();
create trigger operation_audit before insert or update or delete on private.igis_asset_valuations for each row execute function private.igis_operation_audit();
alter table private.igis_lease_contracts enable row level security;
revoke all on private.igis_lease_contracts from public,anon,authenticated;
grant select,insert,update on private.igis_lease_contracts to service_role;
alter table private.igis_lease_terms enable row level security;
revoke all on private.igis_lease_terms from public,anon,authenticated;
grant select,insert,update on private.igis_lease_terms to service_role;
alter table private.igis_operating_periods enable row level security;
revoke all on private.igis_operating_periods from public,anon,authenticated;
grant select,insert,update on private.igis_operating_periods to service_role;
alter table private.igis_cash_entries enable row level security;
revoke all on private.igis_cash_entries from public,anon,authenticated;
grant select,insert,update on private.igis_cash_entries to service_role;
alter table private.igis_operating_plans enable row level security;
revoke all on private.igis_operating_plans from public,anon,authenticated;
grant select,insert,update on private.igis_operating_plans to service_role;
alter table private.igis_asset_valuations enable row level security;
revoke all on private.igis_asset_valuations from public,anon,authenticated;
grant select,insert,update on private.igis_asset_valuations to service_role;
alter table private.igis_operation_grants enable row level security;
revoke all on private.igis_operation_grants from public,anon,authenticated;
grant select,insert,update on private.igis_operation_grants to service_role;
alter table private.igis_operation_history enable row level security;
revoke all on private.igis_operation_history from public,anon,authenticated;
grant select,insert,update on private.igis_operation_history to service_role;
alter table private.igis_operation_grant_history enable row level security;
revoke all on private.igis_operation_grant_history from public,anon,authenticated;
grant select,insert,update on private.igis_operation_grant_history to service_role;
create trigger operation_history_immutable before update or delete on private.igis_operation_history for each row execute function private.master_no_rewrite();
create trigger operation_grant_history_immutable before update or delete on private.igis_operation_grant_history for each row execute function private.master_no_rewrite();
grant usage,select on sequence private.igis_operation_history_id_seq,private.igis_operation_grant_history_id_seq to service_role;

-- No implicit finance access for ordinary members, fund-name matches, or app admins.
create function public.igis_operation_access(building_key uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid; d text; scope record; result jsonb='[]';
begin
 if not public.has_workplace_permission('details.read') then raise exception 'operation_read_denied';end if;
 select id into a from private.master_assets where existing_building_id=building_key;
 if a is null then return jsonb_build_object('scopes',result);end if;
 for scope in select null::uuid vehicle_id union select distinct i.vehicle_id from private.master_investments i join private.master_investment_objects o on o.id=i.object_id where o.asset_id=a and i.resolution_status in ('verified','source_name_unique','verified_source_evidence') and o.resolution_status in ('verified','verified_source_evidence') loop
  foreach d in array array['lease_contract','operating_actual','operating_plan','valuation'] loop
   if private.igis_operation_allowed(a,scope.vehicle_id,d) then
    result=result||jsonb_build_array(jsonb_build_object('asset_id',a,'vehicle_id',scope.vehicle_id,'vehicle_name',(select name from private.master_vehicles where id=scope.vehicle_id),'domain',d,'can_write',private.igis_operation_allowed(a,scope.vehicle_id,d,true)));
   end if;
  end loop;
 end loop;
 return jsonb_build_object('scopes',result);
end $$;
create function public.igis_operation_records(entity text,asset_key uuid,vehicle_key uuid default null,page_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d text=private.igis_operation_domain(entity);result jsonb;
begin
 if d is null or not private.igis_operation_allowed(asset_key,vehicle_key,d) then raise exception 'operation_read_denied';end if;
 if page_offset is null or page_offset<0 or page_offset>100000 then raise exception 'invalid_page';end if;
 execute format('select coalesce(jsonb_agg(private.igis_operation_json(r)),''[]''::jsonb) from (select to_jsonb(t) r from private.%I t where asset_id=$1 and vehicle_id is not distinct from $2 order by updated_at desc,id limit 50 offset $3) q',entity) into result using asset_key,vehicle_key,page_offset;
 return result;
end $$;
create function public.igis_operation_save(entity text,asset_key uuid,vehicle_key uuid,record_key uuid,expected_revision bigint,changes jsonb,change_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare d text=private.igis_operation_domain(entity);r jsonb;result jsonb;k text;cols text[]='{}';sets text[]='{}';rid uuid=coalesce(record_key,gen_random_uuid());
begin
 if d is null or not private.igis_operation_allowed(asset_key,vehicle_key,d,true) then raise exception 'operation_write_denied';end if;
 if changes is null or jsonb_typeof(changes)<>'object' or changes='{}' or pg_column_size(changes)>65536 or change_reason is null or length(trim(change_reason))<3 then raise exception 'invalid_change';end if;
 for k in select jsonb_object_keys(changes) loop
  if k in ('id','asset_id','vehicle_id','source_row_id','revision','created_at','updated_at','updated_by') or not exists(select 1 from information_schema.columns where table_schema='private' and table_name=entity and column_name=k) then raise exception 'immutable_or_invalid_field';end if;
  cols=array_append(cols,format('%I',k));sets=array_append(sets,format('%I=p.%I',k,k));
 end loop;
 perform set_config('app.igis_operation_reason',change_reason,true);
 if record_key is null then
  if expected_revision is not null then raise exception 'new_record_revision_must_be_null';end if;
  execute format('insert into private.%I(id,asset_id,vehicle_id,%s) select $2,$3,$4,%s from jsonb_populate_record(null::private.%I,$1) p returning to_jsonb(%I.*)',entity,array_to_string(cols,','),array_to_string(cols,','),entity,entity) into result using changes,rid,asset_key,vehicle_key;
 else
  execute format('select to_jsonb(t) from private.%I t where id=$1 and asset_id=$2 and vehicle_id is not distinct from $3 for update',entity) into r using rid,asset_key,vehicle_key;
  if r is null then raise exception 'record_not_found';end if;
  if expected_revision is null or expected_revision<>(r->>'revision')::bigint then raise exception 'revision_conflict';end if;
  execute format('update private.%I t set %s from jsonb_populate_record(null::private.%I,$1) p where t.id=$2 returning to_jsonb(t)',entity,array_to_string(sets,','),entity) into result using changes,rid;
 end if;
 return private.igis_operation_json(result);
end $$;
create function public.igis_operation_record_history(entity text,record_key uuid,page_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d text=private.igis_operation_domain(entity);r jsonb;result jsonb;
begin
 if d is null or not public.has_workplace_permission('details.read') then raise exception 'operation_read_denied';end if;
 execute format('select to_jsonb(t) from private.%I t where id=$1',entity) into r using record_key;
 if r is null or not private.igis_operation_allowed((r->>'asset_id')::uuid,(r->>'vehicle_id')::uuid,d) then raise exception 'operation_read_denied';end if;
 if page_offset is null or page_offset<0 then raise exception 'invalid_page';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',h.id::text,'changed_at',h.changed_at,'reason',h.reason,'before',private.igis_operation_json(h.before_record),'after',private.igis_operation_json(h.after_record)) order by h.id desc),'[]') into result
 from (select * from private.igis_operation_history h0 where h0.entity=$1 and h0.record_id=record_key order by h0.id desc limit 50 offset page_offset) h;
 return result;
end $$;
create function public.igis_operation_set_grant(member_key uuid,asset_key uuid,vehicle_key uuid,domain_key text,allow_read boolean,allow_write boolean,expires_at timestamptz,change_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not private.data_steward() then raise exception 'operation_grant_denied';end if;
 if member_key is null or not exists(select 1 from private.workplace_members where source_member_id=member_key and enabled) then raise exception 'verified_member_required';end if;
 if change_reason is null or length(trim(change_reason))<3 then raise exception 'invalid_change';end if;
 insert into private.igis_operation_grants(source_member_id,asset_id,vehicle_id,domain,can_read,can_write,valid_until,granted_by,reason)
 values(member_key,asset_key,vehicle_key,domain_key,allow_read,allow_write,expires_at,auth.uid(),change_reason)
 on conflict(source_member_id,asset_id,vehicle_id,domain) do update set can_read=excluded.can_read,can_write=excluded.can_write,valid_from=now(),valid_until=excluded.valid_until,granted_by=auth.uid(),granted_at=now(),reason=excluded.reason returning id into result;
 return result;
end $$;
revoke all on function private.igis_operation_domain(text) from public,anon,authenticated;
revoke all on function private.igis_operation_allowed(uuid,uuid,text,boolean) from public,anon,authenticated;
revoke all on function private.igis_operation_json(jsonb) from public,anon,authenticated;
revoke all on function private.igis_operation_audit() from public,anon,authenticated;
revoke all on function private.igis_grant_audit() from public,anon,authenticated;
revoke all on function public.igis_operation_access(uuid) from public,anon;
grant execute on function public.igis_operation_access(uuid) to authenticated;
revoke all on function public.igis_operation_records(text,uuid,uuid,integer) from public,anon;
grant execute on function public.igis_operation_records(text,uuid,uuid,integer) to authenticated;
revoke all on function public.igis_operation_save(text,uuid,uuid,uuid,bigint,jsonb,text) from public,anon;
grant execute on function public.igis_operation_save(text,uuid,uuid,uuid,bigint,jsonb,text) to authenticated;
revoke all on function public.igis_operation_record_history(text,uuid,integer) from public,anon;
grant execute on function public.igis_operation_record_history(text,uuid,integer) to authenticated;
revoke all on function public.igis_operation_set_grant(uuid,uuid,uuid,text,boolean,boolean,timestamptz,text) from public,anon;
grant execute on function public.igis_operation_set_grant(uuid,uuid,uuid,text,boolean,boolean,timestamptz,text) to authenticated;
notify pgrst,'reload schema';
commit;
