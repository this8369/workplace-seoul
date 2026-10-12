"""Generate structural SQL only; source values never enter migrations/Git."""
import importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('model',Path(__file__).with_name('igis-master-model.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
sql=['''begin;
-- Canonical internal master. Files are immutable provenance; MY edits change these records.
create table private.master_import_batches (
 id uuid primary key, content_hash text not null unique, exported_on date not null,
 source_system text not null, status text not null check(status in ('loading','complete')),
 imported_at timestamptz not null default now(), imported_by uuid references auth.users(id),
 source_file_count integer not null, source_row_count integer not null, detail_row_count integer not null
);
create table private.master_import_files (
 id uuid primary key, batch_id uuid not null references private.master_import_batches(id),
 name text not null, sha256 text not null, original_xlsx bytea not null,
 metadata jsonb not null, unique(batch_id,name)
);
create table private.master_source_rows (
 id uuid primary key, file_id uuid not null references private.master_import_files(id),
 sheet_name text not null, excel_row integer not null, row_kind text not null check(row_kind in ('detail','control')),
 values_json jsonb not null, raw_cells jsonb not null, row_hash text not null,
 unique(file_id,sheet_name,excel_row)
);
create table private.master_field_dictionary (
 id bigint generated always as identity primary key, source_system text not null,
 source_file_type text not null, source_column text not null, source_label text not null,
 target_table text not null, target_field text not null, postgres_type text not null,
 rules jsonb not null, unique(source_system,source_file_type,source_column)
);
create table private.master_access (
 user_id uuid not null references auth.users(id), feature text not null check(feature in ('master.read','master.write','master.history','master.confidential')),
 allowed boolean not null, primary key(user_id,feature)
);
create table private.master_change_history (
 id bigint generated always as identity primary key, table_name text not null, record_id uuid not null,
 operation text not null, previous_revision bigint, next_revision bigint, before_record jsonb, after_record jsonb,
 changed_fields text[] not null, changed_by uuid references auth.users(id), changed_at timestamptz not null default now(),
 change_origin text not null, change_reason text not null, import_batch_id uuid references private.master_import_batches(id)
);
create index master_history_record on private.master_change_history(table_name,record_id,id desc);
''']
for name,defn in m.TABLES.items():
    cols=['id uuid primary key default gen_random_uuid()']
    cols += [f'{k} {t}' for k,t in defn['columns'].items()]
    cols += ['revision bigint not null default 1 check(revision>0)','created_at timestamptz not null default now()','updated_at timestamptz not null default now()','updated_by uuid references auth.users(id)']
    sql.append(f'create table private.{name} (\n '+',\n '.join(cols)+'\n);')
    sql.append("comment on table private."+name+" is '"+defn['description'].replace("'","''")+"';")
targets={'source_row_id':'private.master_source_rows','party_id':'private.master_parties','tenant_party_id':'private.master_parties','from_party_id':'private.master_parties','to_party_id':'private.master_parties','borrower_party_id':'private.master_parties','lender_party_id':'private.master_parties','investor_party_id':'private.master_parties','vehicle_id':'private.master_vehicles','parent_vehicle_id':'private.master_vehicles','child_vehicle_id':'private.master_vehicles','underlying_vehicle_id':'private.master_vehicles','asset_id':'private.master_assets','parent_asset_id':'private.master_assets','child_asset_id':'private.master_assets','object_id':'private.master_investment_objects','unit_id':'private.master_asset_units','loan_contract_id':'private.master_loan_contracts','existing_building_id':'public.buildings','existing_company_id':'public.companies','existing_occupancy_id':'public.occupancies','existing_complex_id':'public.building_complexes','existing_tower_id':'public.building_towers','reviewed_by':'auth.users'}
for name,defn in m.TABLES.items():
    for col in defn['columns']:
        if col in targets:
            sql.append(f'alter table private.{name} add foreign key ({col}) references {targets[col]}(id);')
            sql.append(f'create index on private.{name} ({col});')
    if 'source_system' in defn['columns']:
        sql.append(f'create unique index on private.{name}(source_row_id) where source_row_id is not null;')
for name in ['master_vehicles','master_investment_objects']:
    sql.append(f'create unique index on private.{name}(source_system,source_code) where source_code is not null;')
sql.append('''
create unique index on private.master_assets(existing_building_id) where existing_building_id is not null;
create unique index on private.master_organizations(party_id) where party_id is not null;
create unique index on private.master_organizations(existing_company_id) where existing_company_id is not null;
alter table private.master_assets add check (length(trim(name))>0);
alter table private.master_parties add check (length(trim(name))>0);
alter table private.master_vehicles add check (length(trim(name))>0);
alter table private.master_assets alter column name set not null;
alter table private.master_parties alter column name set not null;
alter table private.master_vehicles alter column name set not null;
alter table private.master_identifiers add check(num_nonnulls(asset_id,party_id,vehicle_id)=1);
alter table private.master_aliases add check(num_nonnulls(asset_id,party_id,vehicle_id)=1);
alter table private.master_asset_components add check(parent_asset_id<>child_asset_id);
alter table private.master_party_relationships add check(from_party_id<>to_party_id);
alter table private.master_vehicle_relationships add check(parent_vehicle_id<>child_vehicle_id);
alter table private.master_company_financials add check(period_end>=period_start);
alter table private.master_occupancies add check(ended_on is null or started_on is null or ended_on>=started_on);
-- Names are deliberately not unique; undisclosed investors and branch names must not be merged.
-- AUM and financing balances are observations, not sums allocated to every underlying asset.
create function private.master_track_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare b jsonb; a jsonb; changed text[]; origin text; reason text;
begin
 if tg_op='UPDATE' then
  new.revision=old.revision+1; new.updated_at=now(); new.updated_by=auth.uid();
 elsif tg_op='INSERT' then
  new.revision=1; new.updated_at=now(); new.updated_by=auth.uid();
 end if;
 b=case when tg_op='INSERT' then null else to_jsonb(old) end;
 a=case when tg_op='DELETE' then null else to_jsonb(new) end;
 select array_agg(k order by k) into changed from
  (select jsonb_object_keys(coalesce(a,b)) k) keys
  where k not in ('revision','created_at','updated_at','updated_by') and (b->k) is distinct from (a->k);
 origin=coalesce(nullif(current_setting('app.master_origin',true),''),'database');
 reason=coalesce(nullif(current_setting('app.master_reason',true),''),'database change');
 insert into private.master_change_history(table_name,record_id,operation,previous_revision,next_revision,before_record,after_record,changed_fields,changed_by,change_origin,change_reason,import_batch_id)
 values(tg_table_name,coalesce(new.id,old.id),tg_op,(b->>'revision')::bigint,(a->>'revision')::bigint,b,a,coalesce(changed,'{}'),auth.uid(),origin,reason,nullif(current_setting('app.master_batch',true),'')::uuid);
 if tg_op='DELETE' then return old; end if; return new;
end $$;
revoke all on function private.master_track_change() from public,anon,authenticated;
create function private.master_no_rewrite() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'immutable_source_or_history'; end $$;
revoke all on function private.master_no_rewrite() from public,anon,authenticated;
''')
for name in m.TABLES:
    sql.append(f'create trigger master_track_change before insert or update or delete on private.{name} for each row execute function private.master_track_change();')
for name in ['master_import_files','master_source_rows','master_change_history']:
    sql.append(f'create trigger master_no_rewrite before update or delete on private.{name} for each row execute function private.master_no_rewrite();')
sql.append('''
create function public.has_master_permission(feature text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select m.enabled and m.verified_until>now() and public.has_workplace_permission('details.read')
  and coalesce((select a.allowed from private.master_access a where a.user_id=m.user_id and a.feature=$1),
     case when $1='master.read' then true when $1 in ('master.write','master.history','master.confidential') then m.role='admin' else false end)
 from private.workplace_members m where m.user_id=auth.uid()),false)
$$;
revoke all on function public.has_master_permission(text) from public,anon;
grant execute on function public.has_master_permission(text) to authenticated;
''')
allowed=', '.join("'"+n+"'" for n in m.TABLES if n!='master_review_issues')
sql.append(f"""
create function private.master_table_allowed(t text) returns boolean language sql immutable set search_path='' as $$
 select t in ({allowed})
$$;
revoke all on function private.master_table_allowed(text) from public,anon,authenticated;
create function private.master_json(t jsonb, entity_type text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c text; result jsonb=t; label text;
begin
 for c in select column_name from information_schema.columns where table_schema='private' and table_name=entity_type and data_type='numeric' loop
  if t->c is not null and t->c<>'null'::jsonb then result=jsonb_set(result,array[c],to_jsonb(t->>c)); end if;
 end loop;
 if not public.has_master_permission('master.confidential') then result=result-'source_beneficiary_summary'; end if;
 if t->>'vehicle_id' is not null then
  select name into label from private.master_vehicles where id=(t->>'vehicle_id')::uuid;
  result=result||jsonb_build_object('vehicle_label',label);
 end if;
 if entity_type in ('master_loan_positions','master_beneficiary_positions') then
  select name into label from private.master_parties where id=coalesce(t->>'lender_party_id',t->>'investor_party_id')::uuid;
  result=result||jsonb_build_object('party_label',label);
 end if;
 return result;
end $$;
revoke all on function private.master_json(jsonb,text) from public,anon,authenticated;
-- Internal canonical changes are deliberately not propagated into anonymous catalog views.
create function public.master_save_record(entity_type text, record_id uuid, expected_revision bigint, changes jsonb, change_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_record jsonb; result jsonb; col text; cols text[]='{{}}'; sets text[]='{{}}'; record_key uuid=coalesce(record_id,gen_random_uuid());
begin
 if not public.has_master_permission('master.write') or not public.has_master_permission('master.confidential') then raise exception 'master_write_denied'; end if;
 if not private.master_table_allowed(entity_type) then raise exception 'invalid_entity_type'; end if;
 if jsonb_typeof(changes)<>'object' or changes='{{}}'::jsonb or length(trim(change_reason))<3 or change_reason is null then raise exception 'invalid_change'; end if;
 if pg_column_size(changes)>65536 then raise exception 'change_too_large'; end if;
 for col in select jsonb_object_keys(changes) loop
  if col in ('id','revision','created_at','updated_at','updated_by','source_row_id','source_code','source_system','source_exported_on','existing_building_id','existing_company_id','existing_occupancy_id','reviewed_by','reviewed_at','visibility') then raise exception 'immutable_or_review_only_field'; end if;
  if not exists(select 1 from information_schema.columns where table_schema='private' and table_name=entity_type and column_name=col) then raise exception 'invalid_field'; end if;
  cols=array_append(cols,format('%I',col)); sets=array_append(sets,format('%I=p.%I',col,col));
 end loop;
 perform set_config('app.master_origin','my',true); perform set_config('app.master_reason',change_reason,true); perform set_config('app.master_batch','',true);
 if record_id is null then
  if expected_revision is not null then raise exception 'new_record_revision_must_be_null'; end if;
  execute format('insert into private.%I (id,%s) select $2,%s from jsonb_populate_record(null::private.%I,$1) p returning to_jsonb(%I.*)',entity_type,array_to_string(cols,','),array_to_string(cols,','),entity_type,entity_type) into result using changes,record_key;
 else
  execute format('select to_jsonb(t) from private.%I t where id=$1 for update',entity_type) into current_record using record_id;
  if current_record is null then raise exception 'record_not_found'; end if;
  if expected_revision is null or (current_record->>'revision')::bigint<>expected_revision then raise exception 'revision_conflict'; end if;
  execute format('update private.%I t set %s from jsonb_populate_record(null::private.%I,$1) p where t.id=$2 returning to_jsonb(t)',entity_type,array_to_string(sets,','),entity_type) into result using changes,record_id;
 end if;
 return private.master_json(result,entity_type);
end $$;
revoke all on function public.master_save_record(text,uuid,bigint,jsonb,text) from public,anon;
grant execute on function public.master_save_record(text,uuid,bigint,jsonb,text) to authenticated;

create function public.master_list_records(entity_type text, search_text text default '', page_limit integer default 30, page_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare payload jsonb; predicate text='true';
begin
 if not public.has_master_permission('master.read') then raise exception 'master_read_denied'; end if;
 if not private.master_table_allowed(entity_type) then raise exception 'invalid_entity_type'; end if;
 if page_limit not between 1 and 100 or page_offset not between 0 and 100000 or length(search_text)>200 then raise exception 'invalid_page'; end if;
 if not public.has_master_permission('master.confidential') then
  if entity_type='master_beneficiary_positions' then predicate='not coalesce(t.confidential,true)';
  elsif entity_type='master_parties' then predicate='not coalesce(t.confidential,true)';
  end if;
  if exists(select 1 from information_schema.columns where table_schema='private' and table_name=entity_type and column_name='party_id') then
   predicate=predicate||' and (t.party_id is null or exists(select 1 from private.master_parties p where p.id=t.party_id and not coalesce(p.confidential,true)))';
  end if;
 end if;
 execute format('select coalesce(jsonb_agg(r.record),''[]''::jsonb) from (select private.master_json(to_jsonb(t),$4) record from private.%I t where %s and ($1='''' or private.master_json(to_jsonb(t),$4)::text ilike ''%%''||$1||''%%'') order by t.created_at,t.id limit $2 offset $3) r',entity_type,predicate)
 into payload using search_text,page_limit,page_offset,entity_type;
 return jsonb_build_object('records',payload,'limit',page_limit,'offset',page_offset);
end $$;
revoke all on function public.master_list_records(text,text,integer,integer) from public,anon;
grant execute on function public.master_list_records(text,text,integer,integer) to authenticated;
create function public.master_record_history(entity_type text, record_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_master_permission('master.history') or not public.has_master_permission('master.confidential') then raise exception 'master_history_denied'; end if;
 if not private.master_table_allowed(entity_type) then raise exception 'invalid_entity_type'; end if;
 return (select coalesce(jsonb_agg(x),'[]'::jsonb) from
  (select id,operation,previous_revision,next_revision,private.master_json(before_record,entity_type) before_record,private.master_json(after_record,entity_type) after_record,changed_fields,changed_by,changed_at,change_origin,change_reason
  from private.master_change_history where table_name=entity_type and master_change_history.record_id=$2 order by id desc limit 100) x);
end $$;
revoke all on function public.master_record_history(text,uuid) from public,anon;
grant execute on function public.master_record_history(text,uuid) to authenticated;

create function public.master_asset_context(building_key uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare asset jsonb; objects jsonb; funds jsonb; vehicle_ids uuid[];
begin
 if not public.has_master_permission('master.read') then raise exception 'master_read_denied'; end if;
 select private.master_json(to_jsonb(a),'master_assets') into asset from private.master_assets a where existing_building_id=building_key;
 select coalesce(jsonb_agg(private.master_json(to_jsonb(o),'master_investment_objects')),'[]'::jsonb) into objects
 from private.master_investment_objects o where o.asset_id=(asset->>'id')::uuid and o.resolution_status='verified_source_evidence';
 select array_agg(distinct i.vehicle_id) into vehicle_ids from private.master_investments i
 join private.master_investment_objects o on o.id=i.object_id where o.asset_id=(asset->>'id')::uuid and o.resolution_status='verified_source_evidence';
 select coalesce(jsonb_agg(private.master_json(to_jsonb(f),'master_vehicles')),'[]'::jsonb) into funds from private.master_vehicles f where id=any(vehicle_ids);
 return jsonb_build_object('asset',asset,'objects',objects,'vehicles',funds);
end $$;
revoke all on function public.master_asset_context(uuid) from public,anon;
grant execute on function public.master_asset_context(uuid) to authenticated;
""")
alltables=list(m.TABLES)+['master_import_batches','master_import_files','master_source_rows','master_field_dictionary','master_access','master_change_history']
for name in alltables:
    sql.append(f'alter table private.{name} enable row level security;\nrevoke all on private.{name} from public,anon,authenticated;')
# No direct table grants. Narrow security-definer functions are the only client surface.
sql+=['revoke all on schema private from public,anon,authenticated;','commit;']
path=Path('supabase/migrations/202610120003_internal_master.sql')
if path.exists():
    raise SystemExit('Baseline migration already exists. Add a new versioned migration; do not rewrite deployed SQL.')
path.write_text('\n'.join(sql)+'\n')
print(f'Generated {path}: {len(alltables)} tables, 248-column field map')
