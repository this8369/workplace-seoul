begin;
-- RPC JSON null arguments arrive as SQL NULL; normalize both before optimistic comparison.

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
 if reason is null or length(trim(reason))<3 or length(reason)>4000 or pg_column_size(proposed)>65536 or client_key is null then raise exception 'invalid_request';end if;
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


-- Use the verified employee identity, never an editable display name or general admin role.
create function private.can_delete_data_history() returns boolean
language sql stable security definer set search_path='' as $$
 select public.has_workplace_permission('details.read') and exists(
  select 1 from private.workplace_members m where m.user_id=auth.uid()
   and m.source_member_id='809a0b49-37da-40e4-b664-8adc2eba4ad3'::uuid
   and m.enabled and m.verified_until>now())
$$;
revoke all on function private.can_delete_data_history() from public,anon,authenticated;

-- Keep canonical correction/audit dependencies intact. Deletion affects displayed
-- timelines, and can be undone without changing the asset or its saved values.
create table private.data_history_deletions(
 history_id bigint primary key references private.data_record_history(id),
 deleted_by uuid not null references auth.users(id),
 deleted_at timestamptz not null default now()
);
alter table private.data_history_deletions enable row level security;
revoke all on private.data_history_deletions from public,anon,authenticated;

create function public.data_set_history_deleted(history_key bigint, deleted boolean) returns void
language plpgsql security definer set search_path='' as $$
declare h private.data_record_history;
begin
 if not private.can_delete_data_history() then raise exception 'history_delete_denied';end if;
 if deleted is null then raise exception 'invalid_change';end if;
 select * into h from private.data_record_history where id=history_key;
 if not found then raise exception 'record_not_found';end if;
 perform private.review_record(h.entity,h.record_id);
 if not private.igis_source_history_allowed(h.entity,h.record_id,h.changed_fields) then raise exception 'history_delete_denied';end if;
 if h.entity in ('master_parties','master_beneficiary_positions') and
  (coalesce((h.before_record->>'confidential')::boolean,true) or coalesce((h.after_record->>'confidential')::boolean,true)) and
  not (public.has_master_permission('master.confidential') or private.fund_can_edit(h.entity,h.record_id)) then raise exception 'history_delete_denied';end if;
 if deleted then
  insert into private.data_history_deletions(history_id,deleted_by) values(history_key,auth.uid()) on conflict do nothing;
 else
  delete from private.data_history_deletions where history_id=history_key;
 end if;
end $$;
revoke all on function public.data_set_history_deleted(bigint,boolean) from public,anon;
grant execute on function public.data_set_history_deleted(bigint,boolean) to authenticated;

create or replace function public.data_field_history(entity text default null,rid uuid default null,field text default null,asset_key uuid default null,page_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare h record; result jsonb='[]';current_record jsonb;fields text[];k text;item jsonb;n integer=0;linked_building uuid;public_record jsonb;mapped text;
begin
 if not public.has_workplace_permission('details.read') then raise exception 'review_read_denied';end if;
 if page_offset is null or page_offset<0 then raise exception 'invalid_page';end if;
 if asset_key is null then perform private.review_record(entity,rid);
 elsif not exists(select 1 from public.buildings where id=asset_key) and not exists(select 1 from private.master_assets where id=asset_key) then raise exception 'review_read_denied';end if;
 for h in select a.*,m.display_name actor_name from private.data_record_history a left join private.workplace_members m on m.user_id=a.changed_by
 where not exists(select 1 from private.data_history_deletions d where d.history_id=a.id) and (asset_key is not null and asset_key=any(a.asset_ids) or asset_key is null and a.entity=$1 and a.record_id=rid and (field is null or field=any(a.changed_fields))) order by a.id desc loop
  begin current_record=private.review_record(h.entity,h.record_id);exception when others then continue;end;
  if h.entity in ('master_parties','master_beneficiary_positions') and (coalesce((h.before_record->>'confidential')::boolean,true) or coalesce((h.after_record->>'confidential')::boolean,true)) and not (public.has_master_permission('master.confidential') or private.fund_can_edit(h.entity,h.record_id)) then continue;end if;
  if not private.igis_source_history_allowed(h.entity,h.record_id,h.changed_fields) then continue;end if;
  item='{}';
  foreach k in array h.changed_fields loop
   if (field is null or asset_key is not null or k=field) and current_record ? k and private.review_business_field(h.entity,k) then item=item||jsonb_build_object(k,jsonb_build_object('before',case when jsonb_typeof(h.before_record->k)='number' then to_jsonb(h.before_record->>k) else h.before_record->k end,'after',case when jsonb_typeof(h.after_record->k)='number' then to_jsonb(h.after_record->>k) else h.after_record->k end));end if;
  end loop;
  -- A field edit writes both the public building and its canonical asset.
  -- Collapse only identical mirrored fields in the combined asset timeline;
  -- per-record history and immutable audit rows remain complete.
  if asset_key is not null and h.entity='master_assets' and h.origin='my' then
   select existing_building_id into linked_building from private.master_assets where id=h.record_id;
   public_record=null;
   if linked_building is not null then
    begin public_record=private.review_record('buildings',linked_building);exception when others then public_record=null;end;
   end if;
   if public_record is not null then
    for k in select jsonb_object_keys(item) loop
     mapped=case k when 'description' then 'overview' when 'lifecycle_status' then 'status' else k end;
     if mapped in ('name','address','gross_area_m2','completion_year','overview','latitude','longitude','status')
      and public_record ? mapped and exists(
       select 1 from private.data_record_history p
       where p.entity='buildings' and p.record_id=linked_building and asset_key=any(p.asset_ids)
        and p.origin='field_edit' and p.changed_at=h.changed_at
        and p.changed_by is not distinct from h.changed_by
        and p.request_id is not distinct from h.request_id and p.reason=h.reason
        and mapped=any(p.changed_fields)
        and p.before_record->mapped is not distinct from h.before_record->k
        and p.after_record->mapped is not distinct from h.after_record->k
      ) then item=item-k;end if;
    end loop;
   end if;
  end if;
  if item='{}' then continue;end if;
  if n>=page_offset and n<page_offset+50 then result=result||jsonb_build_array(jsonb_build_object('id',h.id,'entity',h.entity,'record_id',h.record_id,'record_label',coalesce(current_record->>'name',current_record->>'vehicle_label',current_record->>'address',current_record->>'building_name',current_record->>'company_name',h.entity),'changed_at',h.changed_at,'changed_by_name',h.actor_name,'reason',h.reason,'origin',h.origin,'changes',item));end if;
  n=n+1;if n>page_offset+50 then exit;end if;
 end loop;
 return jsonb_build_object('records',result,'has_more',n>page_offset+50,'can_delete',private.can_delete_data_history());
end $$;

notify pgrst,'reload schema';
commit;
