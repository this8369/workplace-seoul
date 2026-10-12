begin;
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
notify pgrst,'reload schema';
commit;
