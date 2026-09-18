begin;
-- Public, verified building catalog only. Confidential investment data belongs
-- in a separate private schema, never in the public catalog or Git history.
create table public.buildings (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name))>0),
 address text not null,
 region text not null,
 status text not null check(status in ('operating','development')),
 gross_area_m2 numeric(16,6) not null check(gross_area_m2>0),
 area_basis text not null check(area_basis in ('actual','planned')),
 latitude double precision check(latitude between -90 and 90),
 longitude double precision check(longitude between -180 and 180),
 overview text,
 floors_above integer check(floors_above>=0),
 floors_below integer check(floors_below>=0),
 completion_year integer check(completion_year between 1800 and 2200),
 parking_spaces integer check(parking_spaces>=0),
 source_name text not null check(length(trim(source_name))>0),
 source_url text check(source_url ~ '^https?://'),
 verified_on date not null,
 published boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check((latitude is null)=(longitude is null)),
 check((status='operating' and area_basis='actual') or (status='development' and area_basis='planned')),
 check(not published or gross_area_m2 * 121 >= 4000000)
);
create index buildings_published_region_idx on public.buildings(region,status) where published;
create table public.building_facts (
 id uuid primary key default gen_random_uuid(),
 building_id uuid not null references public.buildings(id) on delete cascade,
 category text not null check(category in ('specification','access','amenity','leasing','ownership','transaction','development')),
 field_key text not null,
 value jsonb not null,
 unit text,
 as_of date not null,
 source_name text not null,
 source_url text check(source_url ~ '^https?://'),
 published boolean not null default false,
 created_at timestamptz not null default now()
);
create index building_facts_building_idx on public.building_facts(building_id,category,as_of desc);
create table public.favorites (
 user_id uuid not null references auth.users(id) on delete cascade,
 building_id uuid not null references public.buildings(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(user_id,building_id)
);
-- Historical records are for maintainers only; unpublished corrections must
-- not leak through a history endpoint.
create schema if not exists private;
revoke all on schema private from public,anon,authenticated;
create table private.building_revisions (
 id bigint generated always as identity primary key,
 building_id uuid not null,
 operation text not null,
 previous_record jsonb,
 recorded_at timestamptz not null default now()
);
create function private.audit_building() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into private.building_revisions(building_id,operation,previous_record)
 values(old.id,tg_op,to_jsonb(old));
 if tg_op='DELETE' then return old; end if;
 new.updated_at=now(); return new;
end $$;
revoke all on function private.audit_building() from public,anon,authenticated;
create trigger building_revision before update or delete on public.buildings
 for each row execute function private.audit_building();

alter table public.buildings enable row level security;
alter table public.building_facts enable row level security;
alter table public.favorites enable row level security;
alter table private.building_revisions enable row level security;
revoke all on public.buildings,public.building_facts,public.favorites from public,anon,authenticated;
grant select on public.buildings,public.building_facts to anon,authenticated;
grant select,insert,delete on public.favorites to authenticated;
create policy catalog_read on public.buildings for select to anon,authenticated
 using(published and gross_area_m2 * 121 >= 4000000);
create policy facts_read on public.building_facts for select to anon,authenticated
 using(published and exists(select 1 from public.buildings b where b.id=building_id));
create policy favorites_read on public.favorites for select to authenticated
 using(user_id=(select auth.uid()));
create policy favorites_insert on public.favorites for insert to authenticated
 with check(user_id=(select auth.uid()) and exists(select 1 from public.buildings b where b.id=building_id));
create policy favorites_delete on public.favorites for delete to authenticated
 using(user_id=(select auth.uid()));
commit;
