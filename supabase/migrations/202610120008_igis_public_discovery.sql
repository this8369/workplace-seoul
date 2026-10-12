begin;
-- Unknown area stays NULL; IGIS publication is approved independently of size.
alter table public.buildings alter column gross_area_m2 drop not null;
create table private.igis_catalog_publications (
 building_id uuid primary key references public.buildings(id),
 asset_category text not null check(asset_category in ('office','hotel','logistics','data_center','retail','residential','mixed','other')),
 approved_at timestamptz not null default now(),
 source_as_of date not null,
 evidence jsonb not null
);
alter table private.igis_catalog_publications enable row level security;
revoke all on private.igis_catalog_publications from public,anon,authenticated;
grant all on private.igis_catalog_publications to service_role;
-- Explicit public fields only. No fund IDs, people, financials or raw source rows.
create or replace view public.catalog_buildings with(security_barrier=true) as
 select b.id,b.complex_id,b.name,b.address,b.standard_address,b.road_address,b.region,b.status,
 b.gross_area_m2,b.area_basis,b.latitude,b.longitude,b.completion_year,
 b.typical_floor_rentable_pyeong,b.typical_floor_exclusive_pyeong,b.typical_floor_scope,
 b.typical_floor_source_period,
 (i.building_id is not null) as is_igis,coalesce(i.asset_category,'office') as asset_category
 from public.buildings b
 left join private.igis_catalog_publications i on i.building_id=b.id
 where b.status in ('operating','development') and
 (i.building_id is not null or exists(select 1 from private.catalog_publications p where p.record_type='buildings' and p.record_id=b.id));
comment on view public.catalog_buildings is 'Public asset discovery, including approved IGIS badges. All detail tables and internal investment data remain member-only.';
notify pgrst,'reload schema';
commit;
