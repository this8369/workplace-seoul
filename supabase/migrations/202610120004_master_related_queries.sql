begin;
-- Exact relationship filters; free-text search must never be used as a join.
create function public.master_query_records(entity_type text, search_text text default '', page_limit integer default 30, page_offset integer default 0, vehicle_key uuid default null, party_key uuid default null)
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
  if entity_type in ('master_beneficiary_positions','master_parties') then predicate=predicate||' and not coalesce(t.confidential,true)'; end if;
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
create or replace function public.master_record_history(entity_type text, record_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_master_permission('master.history') or not public.has_master_permission('master.confidential') then raise exception 'master_history_denied'; end if;
 if not private.master_table_allowed(entity_type) then raise exception 'invalid_entity_type'; end if;
 return (select coalesce(jsonb_agg(x),'[]'::jsonb) from
  (select h.id,h.operation,h.previous_revision,h.next_revision,private.master_json(h.before_record,entity_type) before_record,private.master_json(h.after_record,entity_type) after_record,h.changed_fields,h.changed_by,m.display_name as changed_by_name,h.changed_at,h.change_origin,h.change_reason
  from private.master_change_history h left join private.workplace_members m on m.user_id=h.changed_by where h.table_name=entity_type and h.record_id=$2 order by h.id desc limit 100) x);
end $$;
commit;
