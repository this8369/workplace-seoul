begin;
-- Display components need a real member-only asset identity for editing/media.
-- Missing component areas stay NULL; never duplicate the complex total.
alter table public.buildings alter column gross_area_m2 drop not null;
create table private.complex_component_assets(
 tower_id uuid primary key references public.building_towers(id),
 building_id uuid not null unique references public.buildings(id),
 parent_building_id uuid not null references public.buildings(id),
 created_at timestamptz not null default now()
);
alter table private.complex_component_assets enable row level security;
revoke all on private.complex_component_assets from public,anon,authenticated;

create function public.can_read_component_asset(asset_key uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.has_workplace_permission('details.read') and exists(
  select 1 from private.complex_component_assets m join public.building_towers t on t.id=m.tower_id
   join public.building_complexes c on c.id=t.complex_id where m.building_id=asset_key and c.published)
$$;
revoke all on function public.can_read_component_asset(uuid) from public,anon;
grant execute on function public.can_read_component_asset(uuid) to authenticated;
create policy component_asset_member_read on public.buildings for select to authenticated using(public.can_read_component_asset(id));

-- Initial shared photographs may reference one immutable file from separate rows.
-- Replacements always upload a new UUID path; storage deletion checks all references.
alter table public.building_images drop constraint building_images_object_path_key;
alter table public.building_images drop constraint building_images_thumbnail_path_key;
create index building_images_object_reference on public.building_images(object_path) where object_path is not null;
create index building_images_thumbnail_reference on public.building_images(thumbnail_path) where thumbnail_path is not null;
alter table public.building_images add column inherited_from_image_id uuid references public.building_images(id) on delete set null;

create policy keep_referenced_component_photos on storage.objects as restrictive for delete to authenticated using(
 bucket_id<>'building-images' or not exists(select 1 from public.building_images i where i.object_path=storage.objects.name or i.thumbnail_path=storage.objects.name)
);

-- Already approved complex/tower metadata remains public, while generated assets
-- are member-only and do not introduce extra map/list rows.
create or replace view public.catalog_towers with(security_barrier=true) as
 select t.id,t.complex_id,t.building_id,t.label,t.sort_order,t.typical_floor_rentable_pyeong,t.typical_floor_exclusive_pyeong,t.source_period,t.component_kind,t.parent_tower_id
 from public.building_towers t join private.catalog_publications p on p.record_type='building_towers' and p.record_id=t.id
 join public.catalog_complexes c on c.id=t.complex_id
 where t.building_id is null or exists(select 1 from public.catalog_buildings b where b.id=t.building_id)
 or exists(select 1 from private.complex_component_assets m where m.tower_id=t.id and m.building_id=t.building_id);

-- Keep component display metrics and editable asset fields aligned in both directions.
-- Floor values remain canonical on the tower, where manual/source evidence is stored.
create function private.sync_component_asset_metrics() returns trigger
language plpgsql security definer set search_path='' as $$
declare child uuid;
begin
 if pg_trigger_depth()>1 then return new;end if;
 if tg_table_name='buildings' then
  update public.building_towers t set gross_area_m2=new.gross_area_m2,floors_above=new.floors_above,floors_below=new.floors_below,parking_spaces=new.parking_spaces,overview=new.overview
   from private.complex_component_assets m where m.building_id=new.id and t.id=m.tower_id
   and (t.gross_area_m2,t.floors_above,t.floors_below,t.parking_spaces,t.overview) is distinct from (new.gross_area_m2,new.floors_above,new.floors_below,new.parking_spaces,new.overview);
 elsif tg_table_name='building_power_specs' then
  update public.building_towers t set contracted_capacity_mw=new.contracted_capacity_mw from private.complex_component_assets m where m.building_id=new.id and t.id=m.tower_id and t.contracted_capacity_mw is distinct from new.contracted_capacity_mw;
 else
  select building_id into child from private.complex_component_assets where tower_id=new.id;
  if child is not null then
   update public.buildings set gross_area_m2=new.gross_area_m2,floors_above=new.floors_above,floors_below=new.floors_below,parking_spaces=new.parking_spaces,overview=new.overview where id=child
    and (gross_area_m2,floors_above,floors_below,parking_spaces,overview) is distinct from (new.gross_area_m2,new.floors_above,new.floors_below,new.parking_spaces,new.overview);
   update public.building_power_specs set contracted_capacity_mw=new.contracted_capacity_mw where id=child and contracted_capacity_mw is distinct from new.contracted_capacity_mw;
  end if;
 end if;
 return new;
end $$;
revoke all on function private.sync_component_asset_metrics() from public,anon,authenticated;
create trigger sync_component_asset_metrics after update of gross_area_m2,floors_above,floors_below,parking_spaces,overview on public.buildings for each row execute function private.sync_component_asset_metrics();
create trigger sync_component_asset_metrics after update of gross_area_m2,floors_above,floors_below,parking_spaces,overview,contracted_capacity_mw on public.building_towers for each row execute function private.sync_component_asset_metrics();
create trigger sync_component_asset_metrics after update of contracted_capacity_mw on public.building_power_specs for each row execute function private.sync_component_asset_metrics();
notify pgrst,'reload schema';
commit;
