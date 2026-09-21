begin;
create table public.building_complexes (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name))>0),
 representative_building_id uuid not null references public.buildings(id),
 gross_area_m2 numeric not null check(gross_area_m2>0),
 area_method text not null check(area_method in ('aggregate_record','sum_components')),
 source_note text not null,
 published boolean not null default false
);
alter table public.buildings add column complex_id uuid references public.building_complexes(id);
create index buildings_complex on public.buildings(complex_id) where complex_id is not null;
create table public.building_towers (
 id uuid primary key default gen_random_uuid(),
 complex_id uuid not null references public.building_complexes(id) on delete cascade,
 building_id uuid references public.buildings(id),
 label text not null check(length(trim(label))>0 and label !~ '(저|중|고)층'),
 sort_order integer not null,
 typical_floor_rentable_pyeong numeric check(typical_floor_rentable_pyeong>0),
 typical_floor_exclusive_pyeong numeric check(typical_floor_exclusive_pyeong>0),
 source_name text not null default '오피스파인드',
 source_url text check(source_url ~ '^https://officefind[.]co[.]kr/'),
 source_period text,
 collected_at timestamptz,
 content_hash text,
 published boolean not null default false,
 unique(complex_id,label),
 unique(complex_id,sort_order),
 check(typical_floor_exclusive_pyeong<=typical_floor_rentable_pyeong),
 check((typical_floor_rentable_pyeong is null and typical_floor_exclusive_pyeong is null) or (source_url is not null and collected_at is not null and content_hash is not null))
);
comment on column public.building_towers.building_id is 'Optional verified link to an existing component building and its NOC history. Never assign a whole-complex NOC to every tower.';
create function private.validate_tower_member() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.building_id is not null and not exists(select 1 from public.buildings b where b.id=new.building_id and b.complex_id=new.complex_id) then
  raise exception 'Tower building must belong to the same complex';
 end if;
 return new;
end $$;
revoke all on function private.validate_tower_member() from public,anon,authenticated;
create trigger validate_tower_member before insert or update on public.building_towers for each row execute function private.validate_tower_member();
alter table public.building_complexes enable row level security;
alter table public.building_towers enable row level security;
revoke all on public.building_complexes,public.building_towers from public,anon,authenticated;
grant select on public.building_complexes,public.building_towers to anon,authenticated;
grant all on public.building_complexes,public.building_towers to service_role;
create policy complex_read on public.building_complexes for select to anon,authenticated
 using(published and exists(select 1 from public.buildings b where b.id=representative_building_id));
create policy complex_review on public.building_complexes for select to authenticated using((select public.can_review_records()));
create policy tower_read on public.building_towers for select to anon,authenticated
 using(published and exists(select 1 from public.building_complexes c where c.id=complex_id));
create policy tower_review on public.building_towers for select to authenticated using((select public.can_review_records()));
commit;
