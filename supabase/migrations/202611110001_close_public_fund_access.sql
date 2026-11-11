begin;
set local lock_timeout = '5s';

-- The public site has no trusted internal fund backend. Browser sessions,
-- including administrators and previously assigned members, fail closed.
create or replace function public.has_master_permission(feature text) returns boolean
language sql stable security definer set search_path = '' as $$
  select false
$$;

revoke all on function
  public.has_master_permission(text),
  public.master_list_records(text,text,integer,integer),
  public.master_query_records(text,text,integer,integer,uuid,uuid),
  public.master_asset_context(uuid),
  public.master_record_history(text,uuid),
  public.master_save_record(text,uuid,bigint,jsonb,text),
  public.igis_operation_access(uuid),
  public.igis_operation_records(text,uuid,uuid,integer),
  public.igis_operation_save(text,uuid,uuid,uuid,bigint,jsonb,text),
  public.igis_operation_record_history(text,uuid,integer),
  public.igis_operation_set_grant(uuid,uuid,uuid,text,boolean,boolean,timestamptz,text)
from public, anon, authenticated, service_role;

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
    execute format('revoke all on private.%I from public, anon, authenticated, service_role', relation.tablename);
  end loop;
end $$;

-- Keep only the explicitly projected building corrections used by the asset
-- detail UI. The canonical asset row may contain unrelated internal fields.
create or replace function public.master_asset_corrections(building_key uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  correction jsonb;
begin
  if not public.has_workplace_permission('details.read') then
    raise exception 'master_read_denied';
  end if;
  if not public.is_public_detail_asset(building_key) then return null; end if;
  select jsonb_build_object(
    'asset', coalesce(jsonb_object_agg(fields.field, to_jsonb(a)->fields.field)
      filter (where fields.field is not null), '{}'::jsonb),
    'edited_fields', coalesce(jsonb_agg(fields.field order by fields.field)
      filter (where fields.field is not null), '[]'::jsonb)
  ) into correction
  from private.master_assets a
  left join lateral (
    select distinct changed.field
    from private.master_change_history h
    cross join lateral unnest(h.changed_fields) as changed(field)
    where h.table_name = 'master_assets' and h.record_id = a.id and h.change_origin = 'my'
      and changed.field in ('name','address','gross_area_m2','completion_year',
        'description','latitude','longitude','lifecycle_status')
  ) fields on true
  where a.existing_building_id = building_key
  group by a.id;
  return correction;
end $$;

-- Prevent the generic review endpoints from resolving internal records.
create or replace function private.review_schema(entity text) returns text
language sql immutable set search_path = '' as $$
  select case when entity in (
    'buildings','building_facts','companies','transactions','transaction_assets',
    'occupancies','tenant_movements','leasing_quarters','development_records',
    'building_images','building_complexes','building_towers','building_register_records',
    'building_register_links','building_register_floors','building_register_area_parts',
    'building_register_sections','building_parcels','building_places'
  ) then 'public' end
$$;

create or replace function public.data_review_inbox(page_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_workplace_permission('details.read') then raise exception 'review_read_denied'; end if;
  if page_offset is null or page_offset < 0 then raise exception 'invalid_page'; end if;
  return jsonb_build_object('can_review', private.data_steward(), 'requests', (
    select coalesce(jsonb_agg(requests), '[]'::jsonb)
    from (
      select q.*, m.display_name as requester_name, d.display_name as decided_by_name
      from private.data_change_requests q
      left join private.workplace_members m on m.user_id = q.requester
      left join private.workplace_members d on d.user_id = q.decided_by
      where private.review_schema(q.entity) = 'public'
        and (private.data_steward() or q.requester = auth.uid())
      order by (q.status = 'pending') desc, q.requested_at desc
      limit 30 offset page_offset
    ) requests
  ));
end $$;

create or replace function public.data_decide_request(request_key uuid, approve boolean, note text) returns void
language plpgsql security definer set search_path = '' as $$
declare q private.data_change_requests;
begin
  if not private.data_steward() then raise exception 'review_write_denied'; end if;
  if approve is null or note is null or length(trim(note)) < 3 then raise exception 'decision_note_required'; end if;
  select * into q from private.data_change_requests
  where id = request_key and private.review_schema(entity) = 'public' for update;
  if q.id is null or q.status <> 'pending' then raise exception 'request_not_pending'; end if;
  if approve then
    perform set_config('app.review_request', q.id::text, true);
    perform public.data_save_field(q.entity, q.record_id, q.field_key, q.before_value,
      q.proposed_value, '수정 요청 승인: ' || q.reason || ' / ' || note);
  end if;
  update private.data_change_requests set status = case when approve then 'approved' else 'rejected' end,
    decided_by = auth.uid(), decided_at = now(), decision_note = note where id = q.id;
end $$;

-- The combined asset timeline is limited to records from the public asset model.
create or replace function public.data_field_history(entity text default null, rid uuid default null,
  field text default null, asset_key uuid default null, page_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  h record;
  result jsonb = '[]';
  current_record jsonb;
  item jsonb;
  n integer = 0;
begin
  if not public.has_workplace_permission('details.read') then raise exception 'review_read_denied'; end if;
  if page_offset is null or page_offset < 0 then raise exception 'invalid_page'; end if;
  if asset_key is null then perform private.review_record(entity, rid);
  elsif not exists (select 1 from public.buildings where id = asset_key) then
    raise exception 'review_read_denied';
  end if;
  for h in
    select a.*, m.display_name as actor_name from private.data_record_history a
    left join private.workplace_members m on m.user_id = a.changed_by
    where private.review_schema(a.entity) = 'public'
      and not exists (select 1 from private.data_history_deletions d where d.history_id = a.id)
      and (asset_key is not null and asset_key = any(a.asset_ids)
        or asset_key is null and a.entity = $1 and a.record_id = rid
          and (field is null or field = any(a.changed_fields)))
    order by a.id desc
  loop
    begin current_record = private.review_record(h.entity, h.record_id);
    exception when others then continue; end;
    select jsonb_object_agg(k, jsonb_build_object(
      'before', case when jsonb_typeof(h.before_record->k) = 'number'
        then to_jsonb(h.before_record->>k) else h.before_record->k end,
      'after', case when jsonb_typeof(h.after_record->k) = 'number'
        then to_jsonb(h.after_record->>k) else h.after_record->k end
    )) into item
    from unnest(h.changed_fields) k
    where (field is null or asset_key is not null or k = field)
      and current_record ? k and private.review_business_field(h.entity, k);
    if item is null then continue; end if;
    if n >= page_offset and n < page_offset + 50 then
      result = result || jsonb_build_array(jsonb_build_object(
        'id',h.id,'entity',h.entity,'record_id',h.record_id,
        'record_label',coalesce(current_record->>'name',current_record->>'address',
          current_record->>'building_name',current_record->>'company_name',h.entity),
        'changed_at',h.changed_at,'changed_by_name',h.actor_name,
        'reason',h.reason,'origin',h.origin,'changes',item));
    end if;
    n = n + 1;
    if n > page_offset + 50 then exit; end if;
  end loop;
  return jsonb_build_object('records',result,'has_more',n > page_offset + 50,
    'can_delete',private.can_delete_data_history());
end $$;

notify pgrst, 'reload schema';
commit;
