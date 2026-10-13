begin;
-- A non-blank reason is sufficient, including short Korean words such as 계획.
alter table private.data_change_requests drop constraint data_change_requests_reason_check;
alter table private.data_change_requests add constraint data_change_requests_reason_check check(length(trim(reason))>=1);

create or replace function public.master_save_record(entity_type text, record_id uuid, expected_revision bigint, changes jsonb, change_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_record jsonb; result jsonb; col text; cols text[]='{}'; sets text[]='{}'; record_key uuid=coalesce(record_id,gen_random_uuid());
begin
 if not (private.data_steward() or private.fund_can_edit(entity_type,record_id)) then raise exception 'master_write_denied'; end if;
 if entity_type='master_team_assignments' then raise exception 'assignment_review_required'; end if;
 if not private.master_table_allowed(entity_type) then raise exception 'invalid_entity_type'; end if;
 if jsonb_typeof(changes)<>'object' or changes='{}'::jsonb or length(trim(change_reason))<1 or change_reason is null then raise exception 'invalid_change'; end if;
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

create or replace function public.data_submit_request(entity text,rid uuid,field text,expected jsonb,proposed jsonb,reason text,client_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare r jsonb; request_key uuid; existing private.data_change_requests;
begin
 expected=coalesce(expected,'null'::jsonb);
 proposed=coalesce(proposed,'null'::jsonb);
 if entity like 'building_register_%' then raise exception 'official_register_read_only';end if;
 r=private.review_record(entity,rid);
 select * into existing from private.data_change_requests q where q.requester=auth.uid() and q.client_key=$7;
 if existing.id is not null then
  if existing.entity<>entity or existing.record_id<>rid or existing.field_key<>field or coalesce(existing.before_value,'null'::jsonb) is distinct from expected or coalesce(existing.proposed_value,'null'::jsonb) is distinct from proposed or existing.reason is distinct from reason then raise exception 'request_nonce_conflict';end if;
  return existing.id;
 end if;
 if not private.review_business_field(entity,field) or not r ? field then raise exception 'invalid_field';end if;
 if reason is null or length(trim(reason))<1 or length(reason)>4000 or pg_column_size(proposed)>65536 or client_key is null then raise exception 'invalid_request';end if;
 if r->field is distinct from expected then raise exception 'revision_conflict';end if;
 if r->field is not distinct from proposed then raise exception 'no_change';end if;
 insert into private.data_change_requests(entity,record_id,field_key,asset_ids,record_label,before_value,proposed_value,reason,requester,client_key)
 values(entity,rid,field,private.review_asset_ids(entity,rid,r),coalesce(nullif(concat_ws(' · ',r->>'vehicle_label',coalesce(r->>'name',r->>'building_name',r->>'company_name',r->>'beneficiary_name',r->>'lender_name',r->>'address',r->>'source_code',r->>'period')),''),entity||' / '||rid::text),expected,proposed,reason,auth.uid(),client_key)
 on conflict on constraint data_request_nonce do nothing returning id into request_key;
 return coalesce(request_key,(select id from private.data_change_requests q where q.requester=auth.uid() and q.client_key=$7));
end $$;

create or replace function public.data_save_field(entity text,rid uuid,field text,expected jsonb,proposed jsonb,reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;s text;result jsonb;raw jsonb; canonical private.master_assets; mapped text;
begin
 expected=coalesce(expected,'null'::jsonb);
 proposed=coalesce(proposed,'null'::jsonb);
 if entity like 'building_register_%' then raise exception 'official_register_read_only';end if;
 if not (private.data_steward() or private.fund_can_edit(entity,rid)) then raise exception 'review_write_denied';end if;
 s=private.review_schema(entity);if s is null then raise exception 'invalid_entity_type';end if;
 execute format('select to_jsonb(t) from %I.%I t where id=$1 for update',s,entity) into raw using rid;
 r=private.review_record(entity,rid);
 if not private.review_business_field(entity,field) or not r ? field then raise exception 'invalid_field';end if;
 if reason is null or length(trim(reason))<1 or length(reason)>4000 or pg_column_size(proposed)>65536 then raise exception 'invalid_change';end if;
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

notify pgrst,'reload schema';
commit;
