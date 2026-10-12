begin;
-- Subscriptions are private and user-owned. Notifications reuse the permission-
-- filtered field history; confidential fund changes must not leak through alerts.
create table private.asset_alert_subscriptions (
 user_id uuid not null references auth.users(id) on delete cascade,
 building_id uuid not null references public.buildings(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp(),
 last_seen_id bigint not null default 0 check(last_seen_id>=0),
 primary key(user_id,building_id)
);
alter table private.asset_alert_subscriptions enable row level security;
revoke all on private.asset_alert_subscriptions from public,anon,authenticated;

create function public.asset_alert_state(asset_key uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_workplace_permission('details.read') then raise exception 'alert_access_denied';end if;
 return exists(select 1 from private.asset_alert_subscriptions where user_id=auth.uid() and building_id=asset_key);
end $$;

create function public.set_asset_alert(asset_key uuid,enabled boolean) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_workplace_permission('details.read') then raise exception 'alert_access_denied';end if;
 if enabled is null or not exists(select 1 from public.catalog_buildings where id=asset_key) then raise exception 'invalid_asset';end if;
 if enabled then
  insert into private.asset_alert_subscriptions(user_id,building_id) values(auth.uid(),asset_key) on conflict do nothing;
 else
  delete from private.asset_alert_subscriptions where user_id=auth.uid() and building_id=asset_key;
 end if;
 return enabled;
end $$;

create function public.asset_alert_feed() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s record; result jsonb='[]'; latest bigint; changed timestamptz; n integer;
begin
 if auth.uid() is null or not public.has_workplace_permission('details.read') then raise exception 'alert_access_denied';end if;
 for s in select a.*,b.name from private.asset_alert_subscriptions a join public.catalog_buildings b on b.id=a.building_id
 where a.user_id=auth.uid() and exists(select 1 from private.data_record_history h where a.building_id=any(h.asset_ids) and h.id>a.last_seen_id and h.changed_at>=a.created_at) loop
  select max((h->>'id')::bigint),max((h->>'changed_at')::timestamptz),count(*)
  into latest,changed,n
  from jsonb_array_elements(public.data_field_history(asset_key=>s.building_id)->'records') h
  where (h->>'id')::bigint>s.last_seen_id and (h->>'changed_at')::timestamptz>=s.created_at;
  if latest is not null then
   result=result||jsonb_build_array(jsonb_build_object('building_id',s.building_id,'building_name',s.name,'latest_id',latest::text,'changed_at',changed,'changes',n));
  end if;
 end loop;
 return coalesce((select jsonb_agg(item order by (item->>'changed_at')::timestamptz desc) from jsonb_array_elements(result) item),'[]');
end $$;

create function public.read_asset_alert(asset_key uuid,through_id bigint) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_workplace_permission('details.read') then raise exception 'alert_access_denied';end if;
 if through_id is null or through_id<0 then raise exception 'invalid_cursor';end if;
 update private.asset_alert_subscriptions set last_seen_id=greatest(last_seen_id,least(through_id,coalesce((select max(id) from private.data_record_history where asset_key=any(asset_ids)),0)))
 where user_id=auth.uid() and building_id=asset_key;
end $$;

revoke all on function public.asset_alert_state(uuid),public.set_asset_alert(uuid,boolean),public.asset_alert_feed(),public.read_asset_alert(uuid,bigint) from public,anon;
grant execute on function public.asset_alert_state(uuid),public.set_asset_alert(uuid,boolean),public.asset_alert_feed(),public.read_asset_alert(uuid,bigint) to authenticated;
notify pgrst,'reload schema';
commit;
