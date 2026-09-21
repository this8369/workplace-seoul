begin;
alter table public.buildings
 add column typical_floor_rentable_pyeong numeric(14,4) check(typical_floor_rentable_pyeong>0),
 add column typical_floor_exclusive_pyeong numeric(14,4) check(typical_floor_exclusive_pyeong>0),
 add column typical_floor_source_url text check(typical_floor_source_url ~ '^https://officefind[.]co[.]kr/'),
 add column typical_floor_source_period text,
 add column typical_floor_collected_at timestamptz,
 add constraint typical_floor_pair_order check(typical_floor_exclusive_pyeong is null or typical_floor_rentable_pyeong is null or typical_floor_exclusive_pyeong<=typical_floor_rentable_pyeong);
comment on column public.buildings.typical_floor_area_pyeong is 'Legacy unclassified source area. Do not infer rentable/exclusive basis; use the two explicit columns.';
create table private.officefind_floor_imports (
 building_id uuid primary key references public.buildings(id) on delete cascade,
 status text not null,
 source_url text,
 source_name text,
 source_address text,
 rentable_pyeong numeric,
 exclusive_pyeong numeric,
 source_period text,
 raw_floor text,
 match_reason text,
 content_hash text,
 observed_at timestamptz not null default now(),
 audit jsonb not null default '{}'::jsonb
);
alter table private.officefind_floor_imports enable row level security;
revoke all on private.officefind_floor_imports from public,anon,authenticated;
grant all on private.officefind_floor_imports to service_role;
commit;
