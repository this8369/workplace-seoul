begin;
-- Existing workbook values remain reported observations, never fabricated actuals.
create table private.igis_source_field_boundaries(field_key text primary key,domain text not null);
insert into private.igis_source_field_boundaries values
 ('acquisition_noi','operating_actual'),('disposal_noi','operating_actual'),('appraisal_amount','valuation');
alter table private.igis_source_field_boundaries enable row level security;
revoke all on private.igis_source_field_boundaries from public,anon,authenticated;
create or replace function private.master_json(t jsonb, entity_type text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c text; result jsonb=t; label text; domain_key text;
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
 if entity_type='master_investment_objects' then
  for c,domain_key in select field_key,domain from private.igis_source_field_boundaries loop
   if not private.igis_operation_allowed((t->>'asset_id')::uuid,null,domain_key) then result=result-c;end if;
  end loop;
 end if;
 return result;
end $$;

create function private.igis_source_finance_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare f record;before_row jsonb;after_row jsonb;
begin
 -- Trusted ingestion may preserve raw evidence; browser/MY writes require scoped permission.
 if auth.uid() is null then return new;end if;
 before_row=case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;after_row=to_jsonb(new);
 for f in select * from private.igis_source_field_boundaries loop
  if coalesce(before_row->f.field_key,'null') is distinct from coalesce(after_row->f.field_key,'null') or (tg_op='UPDATE' and old.asset_id is distinct from new.asset_id and coalesce(before_row->f.field_key,'null')<>'null'::jsonb) then
   if not private.igis_operation_allowed(new.asset_id,null,f.domain,true) then raise exception 'operation_write_denied';end if;
   if tg_op='UPDATE' and old.asset_id is distinct from new.asset_id and not private.igis_operation_allowed(old.asset_id,null,f.domain,true) then raise exception 'operation_write_denied';end if;
  end if;
 end loop;
 return new;
end $$;
create trigger igis_source_finance_guard before insert or update on private.master_investment_objects for each row execute function private.igis_source_finance_guard();
revoke all on function private.igis_source_finance_guard() from public,anon,authenticated;
revoke all on function private.master_json(jsonb,text) from public,anon,authenticated;

-- Existing request payloads must obey the same financial boundary as the record.
create or replace function public.data_review_inbox(page_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_workplace_permission('details.read') then raise exception 'review_read_denied';end if;
 if page_offset is null or page_offset<0 then raise exception 'invalid_page';end if;
 return jsonb_build_object('can_review',private.data_steward(),'requests',(select coalesce(jsonb_agg(x),'[]') from (
 select q.*,m.display_name as requester_name,d.display_name as decided_by_name from private.data_change_requests q
 left join private.workplace_members m on m.user_id=q.requester left join private.workplace_members d on d.user_id=q.decided_by
 where (private.data_steward() or q.requester=auth.uid()) and not exists(
 select 1 from private.igis_source_field_boundaries f where q.entity='master_investment_objects' and f.field_key=q.field_key and not private.igis_operation_allowed((select asset_id from private.master_investment_objects where id=q.record_id),null,f.domain))
 order by (q.status='pending') desc,q.requested_at desc limit 30 offset page_offset) x));
end $$;
create function private.igis_source_history_allowed(entity text,record_key uuid,changed_fields text[]) returns boolean language sql stable security definer set search_path='' as $$
 select entity<>'master_investment_objects' or not exists(select 1 from private.igis_source_field_boundaries f where f.field_key=any(changed_fields) and not private.igis_operation_allowed((select asset_id from private.master_investment_objects where id=record_key),null,f.domain))
$$;
revoke all on function private.igis_source_history_allowed(text,uuid,text[]) from public,anon,authenticated;

create or replace function public.data_field_history(entity text default null,rid uuid default null,field text default null,asset_key uuid default null,page_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare h record; result jsonb='[]';current_record jsonb;fields text[];k text;item jsonb;n integer=0;linked_building uuid;public_record jsonb;mapped text;
begin
 if not public.has_workplace_permission('details.read') then raise exception 'review_read_denied';end if;
 if page_offset is null or page_offset<0 then raise exception 'invalid_page';end if;
 if asset_key is null then perform private.review_record(entity,rid);
 elsif not exists(select 1 from public.buildings where id=asset_key) and not exists(select 1 from private.master_assets where id=asset_key) then raise exception 'review_read_denied';end if;
 for h in select a.*,m.display_name actor_name from private.data_record_history a left join private.workplace_members m on m.user_id=a.changed_by
 where (asset_key is not null and asset_key=any(a.asset_ids) or asset_key is null and a.entity=$1 and a.record_id=rid and (field is null or field=any(a.changed_fields))) order by a.id desc loop
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
 return jsonb_build_object('records',result,'has_more',n>page_offset+50);
end $$;

create or replace function public.master_record_history(entity_type text, record_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_master_permission('master.history') or not public.has_master_permission('master.confidential') then raise exception 'master_history_denied'; end if;
 if not private.master_table_allowed(entity_type) then raise exception 'invalid_entity_type'; end if;
 return (select coalesce(jsonb_agg(x),'[]'::jsonb) from
  (select h.id,h.operation,h.previous_revision,h.next_revision,private.master_json(h.before_record,entity_type) before_record,private.master_json(h.after_record,entity_type) after_record,h.changed_fields,h.changed_by,m.display_name as changed_by_name,h.changed_at,h.change_origin,h.change_reason
  from private.master_change_history h left join private.workplace_members m on m.user_id=h.changed_by where h.table_name=entity_type and h.record_id=$2 and private.igis_source_history_allowed(entity_type,$2,h.changed_fields) order by h.id desc limit 100) x);
end $$;

notify pgrst,'reload schema';
commit;
