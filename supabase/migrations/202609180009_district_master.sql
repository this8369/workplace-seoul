begin;
create table public.districts (
 key text primary key check(key in ('CBD','GBD','YBD','Others','BBD')),
 label text not null, name text not null, color text not null check(color ~ '^#[A-Fa-f0-9]{6}$'),
 sort_order integer not null unique,
 membership_boundary jsonb not null check(membership_boundary->'geometry'->>'type'='MultiPolygon'),
 display_boundary jsonb not null check(display_boundary->'geometry'->>'type'='MultiPolygon'),
 address_patterns jsonb not null default '[]'::jsonb check(jsonb_typeof(address_patterns)='array'),
 focus_center jsonb check(focus_center is null or jsonb_array_length(focus_center)=2),
 focus_zoom integer check(focus_zoom between 6 and 21),
 source_metadata jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now()
);
alter table public.districts enable row level security;
revoke all on public.districts from public,anon,authenticated;
grant select on public.districts to anon,authenticated;
grant update on public.districts to authenticated;
grant all on public.districts to service_role;
create policy district_public_read on public.districts for select to anon,authenticated using(true);
create policy district_reviewer_update on public.districts for update to authenticated using((select public.can_review_records())) with check((select public.can_review_records()));
create table private.district_revisions (
 id bigint generated always as identity primary key, district_key text not null, previous_record jsonb not null,
 actor uuid, recorded_at timestamptz not null default now()
);
alter table private.district_revisions enable row level security;
revoke all on private.district_revisions from public,anon,authenticated;
create function private.audit_district() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.district_revisions(district_key,previous_record,actor) values(old.key,to_jsonb(old),auth.uid());
 new.updated_at=now(); return new;
end $$;
revoke all on function private.audit_district() from public,anon,authenticated;
create trigger district_revision before update on public.districts for each row execute function private.audit_district();
commit;
