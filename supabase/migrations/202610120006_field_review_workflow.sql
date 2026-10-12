begin;
-- HR refresh is pending. This migration creates no staff/fund assignments.
create function private.data_steward() returns boolean language sql stable security definer set search_path='' as $$
 select public.has_workplace_permission('details.read') and exists(select 1 from private.workplace_members m where m.user_id=auth.uid() and m.enabled and m.verified_until>now() and m.source_member_id in
 ('14eaf982-9d0d-4243-a0b4-eb10626f690a','55f871a3-8d79-42fb-b208-9515b7b366be','809a0b49-37da-40e4-b664-8adc2eba4ad3'))
$$;
create function private.fund_can_edit(entity text, rid uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare funds uuid[];
begin
 if not public.has_master_permission('master.read') or rid is null then return false; end if;
 if entity='master_vehicles' then funds=array[rid];
 elsif entity in ('master_investments','master_loan_positions','master_beneficiary_positions','master_aum_snapshots','master_loan_contracts') then
  execute format('select array[vehicle_id] from private.%I where id=$1',entity) into funds using rid;
 elsif entity='master_investment_objects' then select array_agg(distinct vehicle_id) into funds from private.master_investments where object_id=rid;
 else return false; end if;
 -- Shared source objects require responsibility for every linked fund.
 return cardinality(funds)>0 and not exists(select 1 from unnest(funds) f where f is null or not exists(
  select 1 from private.master_team_assignments a join private.workplace_members m on m.source_member_id=a.source_member_id
  where m.user_id=auth.uid() and m.enabled and m.verified_until>now() and a.vehicle_id=f
   and a.role_kind in ('investment_manager','operation_manager') and coalesce(a.valid_from,current_date)<=current_date and (a.valid_to is null or a.valid_to>=current_date)));
end $$;
create function private.review_schema(entity text) returns text language sql immutable set search_path='' as $$
 select case when private.master_table_allowed(entity) then 'private' when entity in
 ('buildings','building_facts','companies','transactions','transaction_assets','occupancies','tenant_movements','leasing_quarters','development_records','building_images','building_complexes','building_towers','building_register_records','building_register_links','building_register_floors','building_register_area_parts','building_register_sections','building_parcels','building_places') then 'public' end
$$;
create function private.review_asset_ids(entity text,rid uuid,r jsonb) returns uuid[] language plpgsql stable security definer set search_path='' as $$
declare ids uuid[]; record_key uuid; object_key uuid;
begin
 if entity='buildings' then return array[rid]; end if;
 if entity='master_assets' then return array[coalesce((r->>'existing_building_id')::uuid,rid)]; end if;
 if entity='companies' then select array_agg(distinct building_id) into ids from public.occupancies where company_id=rid;return coalesce(ids,'{}');end if;
 if r->>'building_id' is not null then return array[(r->>'building_id')::uuid]; end if;
 if entity='tenant_movements' then return array_remove(array[(r->>'from_building_id')::uuid,(r->>'to_building_id')::uuid],null); end if;
 if entity='building_complexes' then select array_agg(id) into ids from public.buildings where complex_id=rid;return coalesce(ids,'{}');end if;
 if entity='building_towers' then select array_agg(id) into ids from public.buildings where complex_id=(r->>'complex_id')::uuid;return coalesce(ids,'{}');end if;
 if entity like 'building_register_%' then
  record_key=case when entity='building_register_records' then rid else (r->>'record_id')::uuid end;
  select array_agg(building_id) into ids from public.building_register_links where record_id=record_key and status='verified';return coalesce(ids,'{}');
 end if;
 if entity='transaction_assets' then return array[(r->>'building_id')::uuid]; end if;
 if r->>'asset_id' is not null then select array[coalesce(existing_building_id,id)] into ids from private.master_assets where id=(r->>'asset_id')::uuid;return coalesce(ids,'{}');end if;
 if entity='master_investments' then object_key=(r->>'object_id')::uuid;
 elsif entity='master_investment_objects' then object_key=rid; end if;
 if object_key is not null then select array[coalesce(a.existing_building_id,a.id)] into ids from private.master_assets a join private.master_investment_objects o on o.asset_id=a.id where o.id=object_key;return coalesce(ids,'{}');end if;
 if entity='master_vehicles' or r->>'vehicle_id' is not null then
  select array_agg(distinct coalesce(a.existing_building_id,a.id)) into ids from private.master_assets a join private.master_investment_objects o on o.asset_id=a.id join private.master_investments i on i.object_id=o.id
  where i.vehicle_id=case when entity='master_vehicles' then rid else (r->>'vehicle_id')::uuid end;
 end if;
 return coalesce(ids,'{}');
end $$;
create or replace function private.master_json(t jsonb, entity_type text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c text; result jsonb=t; label text;
begin
 for c in select column_name from information_schema.columns where table_schema='private' and table_name=entity_type and data_type='numeric' loop
  if t->c is not null and t->c<>'null'::jsonb then result=jsonb_set(result,array[c],to_jsonb(t->>c)); end if;
 end loop;
 if not (public.has_master_permission('master.confidential') or private.fund_can_edit(entity_type,(t->>'id')::uuid)) then result=result-'source_beneficiary_summary'; end if;
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

create function private.review_record(entity text,rid uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s text; r jsonb; assets uuid[]; correction jsonb; k text; mapped text;
begin
 if not public.has_workplace_permission('details.read') then raise exception 'review_read_denied'; end if;
 s=private.review_schema(entity);if s is null then raise exception 'invalid_entity_type';end if;
 execute format('select to_jsonb(t) from %I.%I t where id=$1',s,entity) into r using rid;
 if r is null then raise exception 'record_not_found';end if;
 if s='private' then
  if not public.has_master_permission('master.read') then raise exception 'review_read_denied';end if;
  if entity in ('master_parties','master_beneficiary_positions') and coalesce((r->>'confidential')::boolean,true) and not (public.has_master_permission('master.confidential') or private.fund_can_edit(entity,rid)) then raise exception 'review_read_denied';end if;
  if not (public.has_master_permission('master.confidential') or private.fund_can_edit(entity,rid)) and exists(select 1 from private.master_parties p where p.id in ((r->>'party_id')::uuid,(r->>'from_party_id')::uuid,(r->>'to_party_id')::uuid) and coalesce(p.confidential,true)) then raise exception 'review_read_denied';end if;
  return private.master_json(r,entity);
 end if;
 if entity in ('transactions','transaction_assets') and not public.has_workplace_permission('transactions.read') then raise exception 'review_read_denied';end if;
 if not private.data_steward() then
  if (r ? 'published' and not coalesce((r->>'published')::boolean,false)) or (r ? 'verified' and not coalesce((r->>'verified')::boolean,false)) or (r ? 'review_status' and r->>'review_status'<>'approved') then raise exception 'review_read_denied';end if;
  assets=private.review_asset_ids(entity,rid,r);
  if cardinality(assets)>0 and exists(select 1 from unnest(assets) a where not exists(select 1 from public.buildings b where b.id=a and b.published)) then raise exception 'review_read_denied';end if;
  if entity like 'building_register_%' and cardinality(assets)=0 then raise exception 'review_read_denied';end if;
  if entity='building_register_links' and r->>'status'<>'verified' then raise exception 'review_read_denied';end if;
 end if;
 if entity='buildings' then
  correction=public.master_asset_corrections(rid);
  for k in select jsonb_array_elements_text(coalesce(correction->'edited_fields','[]')) loop
   mapped=case k when 'description' then 'overview' when 'lifecycle_status' then 'status' else k end;
   if mapped in ('name','address','gross_area_m2','completion_year','overview','latitude','longitude','status') then r=jsonb_set(r,array[mapped],coalesce(correction->'asset'->k,'null'));end if;
  end loop;
  if not coalesce(correction->'edited_fields','[]') ? 'address' and nullif(r->>'standard_address','') is not null then r=jsonb_set(r,'{address}',r->'standard_address');end if;
 end if;
 -- JSON numbers must not round large amounts in the browser.
 return (select jsonb_object_agg(e.key,case when jsonb_typeof(e.value)='number' then to_jsonb(e.value#>>'{}') else e.value end) from jsonb_each(r) e);
end $$;
create function private.review_business_field(entity text,field text) returns boolean language sql stable security definer set search_path='' as $$
 select field is not null and field not in ('id','revision','created_at','updated_at','updated_by','published','visibility','review_status','verified','is_current','source_row_id','source_system','source_exported_on','reviewed_by','reviewed_at','object_path','thumbnail_path','confidential','resolution_status','collected_at','source_ordinal')
 and field !~ '_id$' and exists(select 1 from information_schema.columns where table_schema=private.review_schema(entity) and table_name=entity and column_name=field)
$$;
create table private.data_change_requests(
 id uuid primary key default gen_random_uuid(), entity text not null, record_id uuid not null, field_key text not null,
 asset_ids uuid[] not null default '{}', record_label text not null, before_value jsonb, proposed_value jsonb, reason text not null,
 requester uuid not null references auth.users(id), requested_at timestamptz not null default now(),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 recipients uuid[] not null default array['14eaf982-9d0d-4243-a0b4-eb10626f690a'::uuid,'55f871a3-8d79-42fb-b208-9515b7b366be'::uuid,'809a0b49-37da-40e4-b664-8adc2eba4ad3'::uuid],
 decided_by uuid references auth.users(id),decided_at timestamptz,decision_note text,
 client_key uuid not null,constraint data_request_nonce unique(requester,client_key),check(length(trim(reason))>=3)
);
create index on private.data_change_requests(status,requested_at desc);
create table private.data_record_history(
 id bigint generated always as identity primary key, entity text not null,record_id uuid not null,asset_ids uuid[] not null default '{}',
 before_record jsonb,after_record jsonb,changed_fields text[] not null,changed_by uuid,changed_at timestamptz not null default now(),
 reason text not null,origin text not null,request_id uuid,master_history_id bigint unique
);
create index on private.data_record_history(entity,record_id,id desc);
create index on private.data_record_history using gin(asset_ids);
create trigger data_history_immutable before update or delete on private.data_record_history for each row execute function private.master_no_rewrite();
create function private.review_audit_public() returns trigger language plpgsql security definer set search_path='' as $$
declare b jsonb; a jsonb; fields text[];
begin
 b=case when tg_op='INSERT' then null else to_jsonb(old) end;a=case when tg_op='DELETE' then null else to_jsonb(new) end;
 select array_agg(k) into fields from jsonb_object_keys(coalesce(a,b)) k where private.review_business_field(tg_table_name,k) and b->k is distinct from a->k;
 if cardinality(fields)>0 then insert into private.data_record_history(entity,record_id,asset_ids,before_record,after_record,changed_fields,changed_by,reason,origin,request_id)
 values(tg_table_name,coalesce(new.id,old.id),private.review_asset_ids(tg_table_name,coalesce(new.id,old.id),coalesce(a,b)),b,a,fields,auth.uid(),coalesce(nullif(current_setting('app.review_reason',true),''),'원천 데이터 갱신'),coalesce(nullif(current_setting('app.review_origin',true),''),'source_update'),nullif(current_setting('app.review_request',true),'')::uuid);end if;
 return coalesce(new,old);
end $$;
create function private.review_audit_master() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.operation<>'INSERT' then insert into private.data_record_history(entity,record_id,asset_ids,before_record,after_record,changed_fields,changed_by,changed_at,reason,origin,request_id,master_history_id)
 values(new.table_name,new.record_id,private.review_asset_ids(new.table_name,new.record_id,coalesce(new.after_record,new.before_record)),new.before_record,new.after_record,new.changed_fields,new.changed_by,new.changed_at,new.change_reason,new.change_origin,nullif(current_setting('app.review_request',true),'')::uuid,new.id);end if;return new;
end $$;
create trigger review_master_audit after insert on private.master_change_history for each row execute function private.review_audit_master();
insert into private.data_record_history(entity,record_id,asset_ids,before_record,after_record,changed_fields,changed_by,changed_at,reason,origin,master_history_id)
 select table_name,record_id,private.review_asset_ids(table_name,record_id,coalesce(after_record,before_record)),before_record,after_record,changed_fields,changed_by,changed_at,change_reason,change_origin,id
 from private.master_change_history where operation<>'INSERT';
do $$ declare t text;begin for t in select tablename from pg_tables where schemaname='public' and private.review_schema(tablename)='public' loop
 execute format('create trigger review_field_history after insert or update or delete on public.%I for each row execute function private.review_audit_public()',t);end loop;end $$;

create or replace function public.master_save_record(entity_type text, record_id uuid, expected_revision bigint, changes jsonb, change_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_record jsonb; result jsonb; col text; cols text[]='{}'; sets text[]='{}'; record_key uuid=coalesce(record_id,gen_random_uuid());
begin
 if not (private.data_steward() or private.fund_can_edit(entity_type,record_id)) then raise exception 'master_write_denied'; end if;
 if entity_type='master_team_assignments' then raise exception 'assignment_review_required'; end if;
 if not private.master_table_allowed(entity_type) then raise exception 'invalid_entity_type'; end if;
 if jsonb_typeof(changes)<>'object' or changes='{}'::jsonb or length(trim(change_reason))<3 or change_reason is null then raise exception 'invalid_change'; end if;
 if pg_column_size(changes)>65536 then raise exception 'change_too_large'; end if;
 for col in select jsonb_object_keys(changes) loop
  if not private.data_steward() and (col like '%\_id' escape '\' or col in ('confidential','resolution_status')) then raise exception 'immutable_or_review_only_field'; end if;
  if col in ('id','revision','created_at','updated_at','updated_by','source_row_id','source_system','source_exported_on','existing_building_id','existing_company_id','existing_occupancy_id','reviewed_by','reviewed_at','visibility') then raise exception 'immutable_or_review_only_field'; end if;
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


create function public.data_field_context(entity text,rid uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb; fields jsonb;
begin
 r=private.review_record(entity,rid);
 select jsonb_agg(jsonb_build_object('key',column_name,'type',data_type,'value',r->column_name) order by ordinal_position) into fields from information_schema.columns where table_schema=private.review_schema(entity) and table_name=entity and r ? column_name and private.review_business_field(entity,column_name);
 return jsonb_build_object('record',r,'fields',coalesce(fields,'[]'),'read_only',entity like 'building_register_%','can_edit',entity not like 'building_register_%' and (private.data_steward() or private.fund_can_edit(entity,rid)),'asset_ids',private.review_asset_ids(entity,rid,r));
end $$;
create function public.data_submit_request(entity text,rid uuid,field text,expected jsonb,proposed jsonb,reason text,client_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare r jsonb; request_key uuid; existing private.data_change_requests;
begin
 if entity like 'building_register_%' then raise exception 'official_register_read_only';end if;
 r=private.review_record(entity,rid);
 select * into existing from private.data_change_requests q where q.requester=auth.uid() and q.client_key=$7;
 if existing.id is not null then
  if existing.entity<>entity or existing.record_id<>rid or existing.field_key<>field or existing.before_value is distinct from expected or existing.proposed_value is distinct from proposed or existing.reason is distinct from reason then raise exception 'request_nonce_conflict';end if;
  return existing.id;
 end if;
 if not private.review_business_field(entity,field) or not r ? field then raise exception 'invalid_field';end if;
 if reason is null or length(trim(reason))<3 or length(reason)>4000 or pg_column_size(proposed)>65536 or client_key is null then raise exception 'invalid_request';end if;
 if r->field is distinct from expected then raise exception 'revision_conflict';end if;
 if r->field is not distinct from proposed then raise exception 'no_change';end if;
 insert into private.data_change_requests(entity,record_id,field_key,asset_ids,record_label,before_value,proposed_value,reason,requester,client_key)
 values(entity,rid,field,private.review_asset_ids(entity,rid,r),coalesce(nullif(concat_ws(' · ',r->>'vehicle_label',coalesce(r->>'name',r->>'building_name',r->>'company_name',r->>'beneficiary_name',r->>'lender_name',r->>'address',r->>'source_code',r->>'period')),''),entity||' / '||rid::text),expected,proposed,reason,auth.uid(),client_key)
 on conflict on constraint data_request_nonce do nothing returning id into request_key;
 return coalesce(request_key,(select id from private.data_change_requests q where q.requester=auth.uid() and q.client_key=$7));
end $$;
create function public.data_save_field(entity text,rid uuid,field text,expected jsonb,proposed jsonb,reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;s text;result jsonb;raw jsonb; canonical private.master_assets; mapped text;
begin
 if entity like 'building_register_%' then raise exception 'official_register_read_only';end if;
 if not (private.data_steward() or private.fund_can_edit(entity,rid)) then raise exception 'review_write_denied';end if;
 s=private.review_schema(entity);if s is null then raise exception 'invalid_entity_type';end if;
 execute format('select to_jsonb(t) from %I.%I t where id=$1 for update',s,entity) into raw using rid;
 r=private.review_record(entity,rid);
 if not private.review_business_field(entity,field) or not r ? field then raise exception 'invalid_field';end if;
 if reason is null or length(trim(reason))<3 or length(reason)>4000 or pg_column_size(proposed)>65536 then raise exception 'invalid_change';end if;
 if r->field is distinct from expected then raise exception 'revision_conflict';end if;
 if r->field is not distinct from proposed then raise exception 'no_change';end if;
 perform set_config('app.review_reason',reason,true);perform set_config('app.review_origin','field_edit',true);
 if s='private' then
  result=public.master_save_record(entity,rid,(r->>'revision')::bigint,jsonb_build_object(field,proposed),reason);
 else
  execute format('update public.%I t set %I=p.%I from jsonb_populate_record(null::public.%I,$1) p where t.id=$2 returning to_jsonb(t)',entity,field,field,entity) into result using jsonb_build_object(field,proposed),rid;
  if entity='buildings' and field in ('name','address','gross_area_m2','completion_year','overview','latitude','longitude','status') then
   -- Keep canonical corrections and the explicitly approved public projection aligned.
   mapped=case field when 'overview' then 'description' when 'status' then 'lifecycle_status' else field end;
   select * into canonical from private.master_assets where existing_building_id=rid for update;
   if canonical.id is not null then perform public.master_save_record('master_assets',canonical.id,canonical.revision,jsonb_build_object(mapped,proposed),reason);end if;
   if field='address' and raw ? 'standard_address' then execute 'update public.buildings set standard_address=$1 where id=$2' using proposed#>>'{}',rid;end if;
  end if;
 end if;
 return private.review_record(entity,rid);
end $$;
create function public.data_review_inbox(page_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_workplace_permission('details.read') then raise exception 'review_read_denied';end if;
 if page_offset is null or page_offset<0 then raise exception 'invalid_page';end if;
 return jsonb_build_object('can_review',private.data_steward(),'requests',(select coalesce(jsonb_agg(x),'[]') from (select q.*,m.display_name as requester_name,d.display_name as decided_by_name from private.data_change_requests q left join private.workplace_members m on m.user_id=q.requester left join private.workplace_members d on d.user_id=q.decided_by where private.data_steward() or q.requester=auth.uid() order by (q.status='pending') desc,q.requested_at desc limit 30 offset page_offset) x));
end $$;
create function public.data_decide_request(request_key uuid,approve boolean,note text) returns void language plpgsql security definer set search_path='' as $$
declare q private.data_change_requests;
begin
 if not private.data_steward() then raise exception 'review_write_denied';end if;
 if approve is null or note is null or length(trim(note))<3 then raise exception 'decision_note_required';end if;
 select * into q from private.data_change_requests where id=request_key for update;
 if q.id is null or q.status<>'pending' then raise exception 'request_not_pending';end if;
 if approve then
  perform set_config('app.review_request',q.id::text,true);
  perform public.data_save_field(q.entity,q.record_id,q.field_key,q.before_value,q.proposed_value,'수정 요청 승인: '||q.reason||' / '||note);
 end if;
 update private.data_change_requests set status=case when approve then 'approved' else 'rejected' end,decided_by=auth.uid(),decided_at=now(),decision_note=note where id=q.id;
end $$;
create function public.data_field_history(entity text default null,rid uuid default null,field text default null,asset_key uuid default null,page_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare h record; result jsonb='[]';current_record jsonb;fields text[];k text;item jsonb;n integer=0;
begin
 if not public.has_workplace_permission('details.read') then raise exception 'review_read_denied';end if;
 if page_offset is null or page_offset<0 then raise exception 'invalid_page';end if;
 if asset_key is null then perform private.review_record(entity,rid);
 elsif not exists(select 1 from public.buildings where id=asset_key and (published or private.data_steward())) and not exists(select 1 from private.master_assets where id=asset_key) then raise exception 'review_read_denied';end if;
 for h in select a.*,m.display_name actor_name from private.data_record_history a left join private.workplace_members m on m.user_id=a.changed_by
 where (asset_key is not null and asset_key=any(a.asset_ids) or asset_key is null and a.entity=$1 and a.record_id=rid and (field is null or field=any(a.changed_fields))) order by a.id desc loop
  begin current_record=private.review_record(h.entity,h.record_id);exception when others then continue;end;
  if h.entity in ('master_parties','master_beneficiary_positions') and (coalesce((h.before_record->>'confidential')::boolean,true) or coalesce((h.after_record->>'confidential')::boolean,true)) and not (public.has_master_permission('master.confidential') or private.fund_can_edit(h.entity,h.record_id)) then continue;end if;
  item='{}';
  foreach k in array h.changed_fields loop
   if (field is null or asset_key is not null or k=field) and current_record ? k and private.review_business_field(h.entity,k) then item=item||jsonb_build_object(k,jsonb_build_object('before',case when jsonb_typeof(h.before_record->k)='number' then to_jsonb(h.before_record->>k) else h.before_record->k end,'after',case when jsonb_typeof(h.after_record->k)='number' then to_jsonb(h.after_record->>k) else h.after_record->k end));end if;
  end loop;
  if item='{}' then continue;end if;
  if n>=page_offset and n<page_offset+50 then result=result||jsonb_build_array(jsonb_build_object('id',h.id,'entity',h.entity,'record_id',h.record_id,'record_label',coalesce(current_record->>'name',current_record->>'vehicle_label',current_record->>'address',current_record->>'building_name',current_record->>'company_name',h.entity),'changed_at',h.changed_at,'changed_by_name',h.actor_name,'reason',h.reason,'origin',h.origin,'changes',item));end if;
  n=n+1;if n>page_offset+50 then exit;end if;
 end loop;
 return jsonb_build_object('records',result,'has_more',n>page_offset+50);
end $$;
alter table private.data_change_requests enable row level security;
alter table private.data_record_history enable row level security;
revoke all on private.data_change_requests,private.data_record_history from public,anon,authenticated;
do $$ declare f record;begin for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='private' and p.proname in ('data_steward','fund_can_edit','review_schema','review_asset_ids','review_record','review_business_field','review_audit_public','review_audit_master')) or (n.nspname='public' and p.proname in ('data_field_context','data_submit_request','data_save_field','data_review_inbox','data_decide_request','data_field_history')) loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 if f.signature::text like 'data_%' or f.signature::text like 'public.data_%' then execute format('grant execute on function %s to authenticated',f.signature);end if;
 end loop;end $$;
create or replace function public.master_list_records(entity_type text, search_text text default '', page_limit integer default 30, page_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare payload jsonb; predicate text='true';
begin
 if not public.has_master_permission('master.read') then raise exception 'master_read_denied'; end if;
 if not private.master_table_allowed(entity_type) then raise exception 'invalid_entity_type'; end if;
 if page_limit is null or page_offset is null or search_text is null or page_limit not between 1 and 100 or page_offset not between 0 and 100000 or length(search_text)>200 then raise exception 'invalid_page'; end if;
 if not public.has_master_permission('master.confidential') then
  if entity_type='master_beneficiary_positions' then predicate='(not coalesce(t.confidential,true) or private.fund_can_edit(''master_beneficiary_positions'',t.id))';
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


create or replace function public.master_query_records(entity_type text, search_text text default '', page_limit integer default 30, page_offset integer default 0, vehicle_key uuid default null, party_key uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare predicate text='true';payload jsonb;
begin
 if not public.has_master_permission('master.read') then raise exception 'master_read_denied'; end if;
 if not private.master_table_allowed(entity_type) then raise exception 'invalid_entity_type'; end if;
 if page_limit is null or page_offset is null or search_text is null or page_limit not between 1 and 100 or page_offset not between 0 and 100000 or length(search_text)>200 then raise exception 'invalid_page'; end if;
 if party_key is not null and not public.has_master_permission('master.confidential') and exists(select 1 from private.master_parties where id=party_key and coalesce(confidential,true)) then raise exception 'master_read_denied'; end if;
 if vehicle_key is null and party_key is null then return public.master_list_records(entity_type,search_text,page_limit,page_offset); end if;
 if vehicle_key is not null then
  if entity_type='master_vehicles' then predicate=predicate||' and t.id=$5';
  elsif entity_type='master_investment_objects' then predicate=predicate||' and exists(select 1 from private.master_investments i where i.object_id=t.id and i.vehicle_id=$5)';
  elsif entity_type='master_assets' then predicate=predicate||' and exists(select 1 from private.master_investments i join private.master_investment_objects o on o.id=i.object_id where o.asset_id=t.id and i.vehicle_id=$5)';
  elsif entity_type='master_parties' then predicate=predicate||' and exists(select 1 from private.master_party_roles r where r.party_id=t.id and r.vehicle_id=$5)';
  elsif exists(select 1 from information_schema.columns where table_schema='private' and table_name=entity_type and column_name='vehicle_id') then predicate=predicate||' and t.vehicle_id=$5';
  else return jsonb_build_object('records','[]'::jsonb); end if;
 end if;
 if party_key is not null then
  if entity_type='master_parties' then predicate=predicate||' and t.id=$6';
  elsif entity_type='master_loan_positions' then predicate=predicate||' and t.lender_party_id=$6';
  elsif entity_type='master_beneficiary_positions' then predicate=predicate||' and t.investor_party_id=$6';
  elsif entity_type='master_vehicles' then predicate=predicate||' and exists(select 1 from private.master_party_roles r where r.vehicle_id=t.id and r.party_id=$6)';
  elsif exists(select 1 from information_schema.columns where table_schema='private' and table_name=entity_type and column_name='party_id') then predicate=predicate||' and t.party_id=$6';
  else return jsonb_build_object('records','[]'::jsonb); end if;
 end if;
 if not public.has_master_permission('master.confidential') then
  if entity_type='master_beneficiary_positions' then predicate=predicate||' and (not coalesce(t.confidential,true) or private.fund_can_edit(''master_beneficiary_positions'',t.id))'; elsif entity_type='master_parties' then predicate=predicate||' and not coalesce(t.confidential,true)'; end if;
  if exists(select 1 from information_schema.columns where table_schema='private' and table_name=entity_type and column_name='party_id') then
   predicate=predicate||' and (t.party_id is null or exists(select 1 from private.master_parties p where p.id=t.party_id and not coalesce(p.confidential,true)))';
  end if;
 end if;
 execute format('select coalesce(jsonb_agg(r.record),''[]''::jsonb) from (select private.master_json(to_jsonb(t),$4) record from private.%I t where %s and ($1='''' or private.master_json(to_jsonb(t),$4)::text ilike ''%%''||$1||''%%'') order by t.created_at,t.id limit $2 offset $3) r',entity_type,predicate)
 into payload using search_text,page_limit,page_offset,entity_type,vehicle_key,party_key;
 return jsonb_build_object('records',payload,'limit',page_limit,'offset',page_offset);
end $$;
revoke all on function public.master_query_records(text,text,integer,integer,uuid,uuid) from public,anon;
grant execute on function public.master_query_records(text,text,integer,integer,uuid,uuid) to authenticated;

notify pgrst,'reload schema';
commit;
