begin;
-- Restricted ingestion history: credentials and request URLs are never stored.
create table private.building_register_snapshots (
 id uuid primary key default gen_random_uuid(),
 operation text not null check(operation in ('getBrTitleInfo','getBrRecapTitleInfo','getBrBasisOulnInfo','getBrFlrOulnInfo','getBrExposPubuseAreaInfo','getBrAtchJibunInfo','getBrJijiguInfo','getBrWclfInfo')),
 parcel_key text not null check(parcel_key ~ '^\d{5}-\d{5}-[012]-\d{4}-\d{4}$'),
 query jsonb not null check(not (query ? 'serviceKey')),
 content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'),
 response jsonb not null,
 collected_at timestamptz not null,
 imported_at timestamptz not null default now(),
 unique(operation,parcel_key,collected_at,content_hash)
);
revoke all on private.building_register_snapshots from public,anon,authenticated;
grant all on private.building_register_snapshots to service_role;
create table public.building_register_records (
 id uuid primary key default gen_random_uuid(),
 register_pk text not null,
 record_kind text not null check(record_kind in ('complex','building')),
 parcel_key text not null,
 snapshot_id uuid not null references private.building_register_snapshots(id),
 building_name text,
 dong_name text,
 register_type text,
 register_kind text,
 lot_address text,
 road_address text,
 main_annex_code text,
 main_annex_name text,
 main_use text,
 other_use text,
 structure text,
 other_structure text,
 roof text,
 other_roof text,
 seismic_design text,
 seismic_capacity text,
 energy_grade text,
 green_grade text,
 intelligent_grade text,
 site_area_m2 numeric check(site_area_m2>=0),
 building_area_m2 numeric check(building_area_m2>=0),
 gross_area_m2 numeric check(gross_area_m2>=0),
 far_area_m2 numeric check(far_area_m2>=0),
 coverage_ratio numeric check(coverage_ratio>=0),
 floor_area_ratio numeric check(floor_area_ratio>=0),
 height_m numeric check(height_m>=0),
 floors_above numeric check(floors_above>=0),
 floors_below numeric check(floors_below>=0),
 passenger_elevators numeric check(passenger_elevators>=0),
 emergency_elevators numeric check(emergency_elevators>=0),
 parking_total numeric check(parking_total>=0),
 parking_indoor_mechanical numeric check(parking_indoor_mechanical>=0),
 parking_outdoor_mechanical numeric check(parking_outdoor_mechanical>=0),
 parking_indoor_self numeric check(parking_indoor_self>=0),
 parking_outdoor_self numeric check(parking_outdoor_self>=0),
 main_buildings numeric check(main_buildings>=0),
 annex_buildings numeric check(annex_buildings>=0),
 annex_area_m2 numeric check(annex_area_m2>=0),
 households numeric check(households>=0),
 units numeric check(units>=0),
 energy_saving_ratio numeric check(energy_saving_ratio>=0),
 energy_epi numeric check(energy_epi>=0),
 green_score numeric check(green_score>=0),
 intelligent_score numeric check(intelligent_score>=0),
 permit_date date,
 construction_start_date date,
 approval_date date,
 source_created_date date,
 collected_at timestamptz not null,
 is_current boolean not null default true,
 unique(register_pk,record_kind)
);
create index building_register_parcel on public.building_register_records(parcel_key);
create table public.building_register_links (
 id uuid primary key default gen_random_uuid(),
 building_id uuid not null references public.buildings(id) on delete cascade,
 tower_id uuid references public.building_towers(id) on delete cascade,
 record_id uuid not null references public.building_register_records(id),
 status text not null default 'candidate' check(status in ('candidate','verified','rejected')),
 evidence text not null check(length(trim(evidence))>0),
 reviewed_at timestamptz,
 check(status <> 'verified' or reviewed_at is not null),
 unique(building_id,record_id)
);
create index building_register_links_record on public.building_register_links(record_id);
create function private.validate_register_tower() returns trigger language plpgsql set search_path='' as $$
begin
 if new.tower_id is not null and not exists (
  select 1 from public.building_towers t join public.buildings b on b.complex_id=t.complex_id
  where t.id=new.tower_id and b.id=new.building_id
 ) then raise exception 'Register tower must belong to asset complex'; end if;
 return new;
end $$;
revoke all on function private.validate_register_tower() from public,anon,authenticated;
create trigger register_tower_identity before insert or update on public.building_register_links for each row execute function private.validate_register_tower();
create table public.building_register_floors (
 id uuid primary key default gen_random_uuid(),
 record_id uuid not null references public.building_register_records(id) on delete cascade,
 snapshot_id uuid not null references private.building_register_snapshots(id),
 source_ordinal integer not null,
 register_pk text not null,
 dong_name text,
 floor_category text,
 floor_code text,
 floor_number numeric,
 floor_name text,
 main_annex_name text,
 structure text,
 main_use text,
 other_use text,
 area_m2 numeric check(area_m2>=0),
 area_excluded text,
 source_created_date date,
 unique(record_id,source_ordinal)
);
create table public.building_register_area_parts (
 id uuid primary key default gen_random_uuid(),
 record_id uuid not null references public.building_register_records(id) on delete cascade,
 snapshot_id uuid not null references private.building_register_snapshots(id),
 source_ordinal integer not null,
 register_pk text not null,
 dong_name text,
 unit_name text,
 floor_category text,
 floor_number numeric,
 area_category text,
 area_category_code text,
 main_annex_name text,
 structure text,
 main_use text,
 other_use text,
 area_m2 numeric check(area_m2>=0),
 source_created_date date,
 unique(record_id,source_ordinal)
);
comment on table public.building_register_records is 'Official register facts, separate from source asset master and development plans. A complex record is never added to its component areas.';
comment on table public.building_register_floors is 'Actual per-floor use/structure rows; may contain multiple rows per floor. Not rental low/mid/high strata and not typical rentable/exclusive area.';
comment on table public.building_register_area_parts is 'Official exclusive/common subdivisions. Do not automatically equate these with marketed typical-floor rental/exclusive area.';
alter table public.building_register_records enable row level security;
revoke all on public.building_register_records from public,anon,authenticated;
grant select on public.building_register_records to anon,authenticated;
grant all on public.building_register_records to service_role;
alter table public.building_register_links enable row level security;
revoke all on public.building_register_links from public,anon,authenticated;
grant select on public.building_register_links to anon,authenticated;
grant all on public.building_register_links to service_role;
alter table public.building_register_floors enable row level security;
revoke all on public.building_register_floors from public,anon,authenticated;
grant select on public.building_register_floors to anon,authenticated;
grant all on public.building_register_floors to service_role;
alter table public.building_register_area_parts enable row level security;
revoke all on public.building_register_area_parts from public,anon,authenticated;
grant select on public.building_register_area_parts to anon,authenticated;
grant all on public.building_register_area_parts to service_role;
create policy register_links_read on public.building_register_links for select to anon,authenticated using (
 status='verified' and exists(select 1 from public.buildings b where b.id=building_id)
);
create policy register_links_review on public.building_register_links for select to authenticated using((select public.can_review_records()));
create policy register_records_read on public.building_register_records for select to anon,authenticated using (
 exists(select 1 from public.building_register_links l where l.record_id=building_register_records.id and l.status='verified')
);
create policy register_records_review on public.building_register_records for select to authenticated using((select public.can_review_records()));
create policy register_detail_read on public.building_register_floors for select to anon,authenticated using (
 exists(select 1 from public.building_register_records r where r.id=record_id)
);
create policy register_detail_read on public.building_register_area_parts for select to anon,authenticated using (
 exists(select 1 from public.building_register_records r where r.id=record_id)
);
create table public.building_register_sections (
 id uuid primary key default gen_random_uuid(),
 record_id uuid not null references public.building_register_records(id) on delete cascade,
 snapshot_id uuid not null references private.building_register_snapshots(id),
 section text not null check(section in ('zoning','sanitation')),
 source_ordinal integer not null,
 attributes jsonb not null,
 unique(record_id,section,source_ordinal)
);
alter table public.building_register_sections enable row level security;
revoke all on public.building_register_sections from public,anon,authenticated;
grant select on public.building_register_sections to anon,authenticated;
grant all on public.building_register_sections to service_role;
create policy register_section_read on public.building_register_sections for select to anon,authenticated using (
 exists(select 1 from public.building_register_records r where r.id=record_id)
);
commit;
