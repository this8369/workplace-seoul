begin;
-- A source date is not a verification date. Drafts retain null verification.
alter table public.buildings alter column verified_on drop not null;
alter table public.buildings add column source_as_of text;
alter table public.buildings add constraint published_requires_verification check(not published or verified_on is not null);
create table private.source_snapshots (
 id text primary key,
 source_id text not null,
 payload jsonb not null,
 imported_at timestamptz not null default now()
);
create table private.reviewers (email text primary key check(email=lower(email)));
alter table private.source_snapshots enable row level security;
alter table private.reviewers enable row level security;
revoke all on private.source_snapshots,private.reviewers from public,anon,authenticated;
create function public.can_review_records() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u join private.reviewers r on r.email=lower(u.email) where u.id=auth.uid() and u.email_confirmed_at is not null)
$$;
revoke all on function public.can_review_records() from public,anon;
grant execute on function public.can_review_records() to authenticated;
create policy reviewer_buildings on public.buildings for select to authenticated using((select public.can_review_records()));
create policy reviewer_transactions on public.transactions for select to authenticated using((select public.can_review_records()));
create policy reviewer_companies on public.companies for select to authenticated using((select public.can_review_records()));
create policy reviewer_occupancies on public.occupancies for select to authenticated using((select public.can_review_records()));
create policy reviewer_movements on public.tenant_movements for select to authenticated using((select public.can_review_records()));
create policy reviewer_leasing on public.leasing_quarters for select to authenticated using((select public.can_review_records()));
create policy reviewer_development on public.development_records for select to authenticated using((select public.can_review_records()));
-- Explicit privileges because automatic table exposure is disabled in this project.
grant all on public.buildings,public.building_facts,public.favorites,public.companies,public.transactions,public.transaction_assets,public.occupancies,public.tenant_movements,public.leasing_quarters,public.development_records to service_role;
commit;
