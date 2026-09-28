begin;
-- A building can span several cadastral parcels. Boundaries are source geometry,
-- never inferred from the building point or its gross floor area.
create table public.building_parcels (
 id uuid primary key default gen_random_uuid(),
 building_id uuid not null references public.buildings(id) on delete cascade,
 pnu text not null check(pnu ~ '^[0-9]{19}$'),
 address text not null,
 is_primary boolean not null default false,
 area_m2 numeric check(area_m2 >= 0),
 land_category text,
 land_use text,
 terrain text,
 shape text,
 road_condition text,
 ownership_type text,
 ownership_changed_on date,
 coowners integer check(coowners >= 0),
 geometry jsonb check(geometry is null or geometry->>'type' in ('Polygon','MultiPolygon')),
 zoning jsonb not null default '[]'::jsonb check(jsonb_typeof(zoning) = 'array'),
 official_prices jsonb not null default '[]'::jsonb check(jsonb_typeof(official_prices) = 'array'),
 source_name text not null,
 source_url text,
 as_of date,
 collected_at timestamptz not null default now(),
 verified boolean not null default false,
 unique(building_id,pnu)
);
comment on column public.building_parcels.geometry is 'EPSG:4326 GeoJSON geometry. Coordinates are longitude, latitude. Legal parcel boundary, not building footprint or planned project boundary.';
comment on column public.building_parcels.zoning is 'Array of {name, relation: 포함|접함|저촉, source_name?, source_url?, as_of?}';
comment on column public.building_parcels.official_prices is 'Array of {year, price_won_m2, source_name?, source_url?, as_of?}. Official land price, not market estimate.';
create table public.building_places (
 id uuid primary key default gen_random_uuid(),
 building_id uuid not null references public.buildings(id) on delete cascade,
 category text not null check(category in ('transit','education','amenity')),
 name text not null,
 address text,
 latitude numeric check(latitude between -90 and 90),
 longitude numeric check(longitude between -180 and 180),
 distance_m numeric check(distance_m >= 0),
 walking_minutes numeric check(walking_minutes >= 0),
 walking_source text,
 source_name text not null,
 source_url text,
 as_of date,
 collected_at timestamptz not null default now(),
 verified boolean not null default false,
 check(walking_minutes is null or walking_source is not null)
);
comment on table public.building_places is 'Only store provider data whose reuse/storage terms permit persistence. Walking minutes require a routing source, not a conversion from straight-line distance.';
create index building_places_building_idx on public.building_places(building_id,category);
alter table public.building_parcels enable row level security;
alter table public.building_places enable row level security;
create policy published_parcels on public.building_parcels for select to anon,authenticated
 using(verified and exists(select 1 from public.buildings b where b.id=building_id and b.published));
create policy published_places on public.building_places for select to anon,authenticated
 using(verified and exists(select 1 from public.buildings b where b.id=building_id and b.published));
grant select on public.building_parcels,public.building_places to anon,authenticated;
grant all on public.building_parcels,public.building_places to service_role;
notify pgrst,'reload schema';
commit;
