begin;
-- Match the existing member-only table policies. Legacy published flags describe
-- source verification; catalog_publications independently controls anonymous lists.
create or replace function private.review_record(entity text,rid uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
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
  if (entity='building_facts' and not coalesce((r->>'published')::boolean,false)) or (r ? 'verified' and not coalesce((r->>'verified')::boolean,false)) or (r ? 'review_status' and r->>'review_status'<>'approved') then raise exception 'review_read_denied';end if;
  assets=private.review_asset_ids(entity,rid,r);
  if cardinality(assets)>0 and exists(select 1 from unnest(assets) a where not exists(select 1 from public.buildings b where b.id=a)) then raise exception 'review_read_denied';end if;
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
create or replace function public.data_field_history(entity text default null,rid uuid default null,field text default null,asset_key uuid default null,page_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare h record; result jsonb='[]';current_record jsonb;fields text[];k text;item jsonb;n integer=0;
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
  if item='{}' then continue;end if;
  if n>=page_offset and n<page_offset+50 then result=result||jsonb_build_array(jsonb_build_object('id',h.id,'entity',h.entity,'record_id',h.record_id,'record_label',coalesce(current_record->>'name',current_record->>'vehicle_label',current_record->>'address',current_record->>'building_name',current_record->>'company_name',h.entity),'changed_at',h.changed_at,'changed_by_name',h.actor_name,'reason',h.reason,'origin',h.origin,'changes',item));end if;
  n=n+1;if n>page_offset+50 then exit;end if;
 end loop;
 return jsonb_build_object('records',result,'has_more',n>page_offset+50);
end $$;

notify pgrst,'reload schema';
commit;
