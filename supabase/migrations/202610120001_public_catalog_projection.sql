begin;
-- Public discovery is an explicit projection of the existing catalog. New
-- records (including future IGIS imports) are private until separately approved.
create table private.catalog_publications (
 record_type text not null,
 record_id uuid not null,
 approved_at timestamptz not null default now(),
 primary key(record_type,record_id)
);
alter table private.catalog_publications enable row level security;
revoke all on private.catalog_publications from public,anon,authenticated;
grant all on private.catalog_publications to service_role;
do $$ declare t text; begin
 for t in select unnest(array['buildings','transactions','leasing_quarters',
  'development_records','building_complexes','building_towers','building_images','building_parcels']) loop
  execute format('insert into private.catalog_publications(record_type,record_id) select %L,id from public.%I',t,t);
 end loop;
end $$;

create or replace function public.has_workplace_permission(feature text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare m private.workplace_members;
begin
 if feature='catalog.read' then return true; end if;
 select * into m from private.workplace_members where user_id=auth.uid();
 if not found or not m.enabled or m.verified_until<=now() then return false; end if;
 if m.permissions ? feature then return m.permissions->feature='true'::jsonb; end if;
 return case feature
  when 'details.read' then true
  when 'transactions.read' then true
  when 'favorites.write' then true
  when 'images.manage' then m.role in ('editor','admin')
  when 'assets.write' then m.role in ('editor','admin')
  when 'users.manage' then m.role='admin'
  else false end;
end $$;
create or replace function public.workplace_access() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'linked',exists(select 1 from private.workplace_members where user_id=auth.uid()),
  'display_name',(select display_name from private.workplace_members where user_id=auth.uid()),
  'verified_until',(select verified_until from private.workplace_members where user_id=auth.uid() and enabled),
  'permissions',coalesce((select jsonb_agg(f) from unnest(array['catalog.read','details.read','favorites.write','transactions.read','images.manage','assets.write','users.manage']) f where public.has_workplace_permission(f)),'[]'::jsonb))
$$;
create or replace function public.set_workplace_access(member_user uuid, member_role text, member_enabled boolean, overrides jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.has_workplace_permission('users.manage') then raise exception 'admin_required'; end if;
 if member_user=auth.uid() then raise exception 'cannot_change_own_access'; end if;
 if member_role not in ('viewer','editor','admin') or jsonb_typeof(overrides)<>'object' then raise exception 'invalid_access'; end if;
 if exists(select 1 from jsonb_each(overrides) e where e.key not in ('catalog.read','details.read','favorites.write','transactions.read','images.manage','assets.write','users.manage') or jsonb_typeof(e.value)<>'boolean') then raise exception 'invalid_override'; end if;
 update private.workplace_members set role=member_role,enabled=member_enabled,permissions=overrides,updated_at=now() where user_id=member_user;
 if not found then raise exception 'member_not_found'; end if;
end $$;

-- Intentionally owner-executed, read-only views: explicit fields and publication
-- allowlists are the public boundary, not the underlying member-only table RLS.
create view public.catalog_buildings with(security_barrier=true) as
 select b.id,b.complex_id,b.name,b.address,b.standard_address,b.road_address,b.region,b.status,
 b.gross_area_m2,b.area_basis,b.latitude,b.longitude,b.completion_year,
 b.typical_floor_rentable_pyeong,b.typical_floor_exclusive_pyeong,b.typical_floor_scope,
 b.typical_floor_source_period
 from public.buildings b join private.catalog_publications p on p.record_type='buildings' and p.record_id=b.id
 where b.status in ('operating','development');
create view public.catalog_leasing with(security_barrier=true) as
 select l.id,l.building_id,l.period,l.noc,l.area_basis,l.vat_basis
 from public.leasing_quarters l join private.catalog_publications p on p.record_type='leasing_quarters' and p.record_id=l.id
 join public.catalog_buildings b on b.id=l.building_id
 where l.period=(select max(q.period) from public.leasing_quarters q join private.catalog_publications a on a.record_type='leasing_quarters' and a.record_id=q.id);
create view public.catalog_developments with(security_barrier=true) as
 select d.id,d.building_id,d.year,d.developer,d.contractor,d.as_of
 from public.development_records d join private.catalog_publications p on p.record_type='development_records' and p.record_id=d.id
 join public.catalog_buildings b on b.id=d.building_id
 where d.as_of=(select max(q.as_of) from public.development_records q join private.catalog_publications a on a.record_type='development_records' and a.record_id=q.id where q.building_id=d.building_id);
create view public.catalog_complexes with(security_barrier=true) as
 select c.id,c.name,c.representative_building_id,c.gross_area_m2,c.area_method
 from public.building_complexes c join private.catalog_publications p on p.record_type='building_complexes' and p.record_id=c.id
 join public.catalog_buildings b on b.id=c.representative_building_id;
create view public.catalog_towers with(security_barrier=true) as
 select t.id,t.complex_id,t.building_id,t.label,t.sort_order,t.typical_floor_rentable_pyeong,
 t.typical_floor_exclusive_pyeong,t.source_period
 from public.building_towers t join private.catalog_publications p on p.record_type='building_towers' and p.record_id=t.id
 join public.catalog_complexes c on c.id=t.complex_id
 where t.building_id is null or exists(select 1 from public.catalog_buildings b where b.id=t.building_id);
create view public.catalog_images with(security_barrier=true) as
 select i.id,i.building_id,i.title,i.kind,i.thumbnail_path,
 i.thumbnail_path as object_path,i.focal_x,i.focal_y,i.is_primary,i.review_status
 from public.building_images i join private.catalog_publications p on p.record_type='building_images' and p.record_id=i.id
 join public.catalog_buildings b on b.id=i.building_id
 where i.review_status='approved' and i.is_primary and i.thumbnail_path is not null;
create view public.catalog_transactions with(security_barrier=true) as
 select t.id,t.building_id,t.building_name,t.region,t.year,t.amount_won,t.traded_area_m2,
 t.unit_price_won,t.scope,t.buyer,t.seller,t.link_status
 from public.transactions t join private.catalog_publications p on p.record_type='transactions' and p.record_id=t.id
 where t.building_id is null or exists(select 1 from public.catalog_buildings b where b.id=t.building_id);
-- Only outline coordinates are public for the existing map hover. Land prices,
-- PNU, ownership and other land attributes remain in the member-only table.
create view public.catalog_boundaries with(security_barrier=true) as
 select p.id,p.building_id,p.geometry
 from public.building_parcels p join private.catalog_publications a on a.record_type='building_parcels' and a.record_id=p.id
 join public.catalog_buildings b on b.id=p.building_id where p.verified;
do $$ declare t text; begin
 for t in select unnest(array['catalog_buildings','catalog_leasing','catalog_developments',
  'catalog_complexes','catalog_towers','catalog_images','catalog_transactions','catalog_boundaries']) loop
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to anon,authenticated',t);
 end loop;
end $$;

create function public.is_catalog_thumbnail(object_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.catalog_images i where i.thumbnail_path=object_name)
$$;
revoke all on function public.is_catalog_thumbnail(text) from public,anon,authenticated;
grant execute on function public.is_catalog_thumbnail(text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
