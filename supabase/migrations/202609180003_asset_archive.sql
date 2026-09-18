begin;
-- Published records only. Original Sheets snapshots remain in private staging.
create table public.companies (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name))>0),
 industry text, overview text,
 published boolean not null default false
);
create table public.transactions (
 id uuid primary key default gen_random_uuid(),
 building_id uuid references public.buildings(id),
 building_name text not null, region text not null,
 year integer check(year between 1800 and 2200),
 amount_won numeric check(amount_won>=0),
 building_area_m2 numeric check(building_area_m2>0),
 traded_area_m2 numeric check(traded_area_m2>0),
 unit_price_won numeric check(unit_price_won>=0),
 seller text not null default '', buyer text not null default '',
 scope text not null default '미확인', kind text not null default '', note text not null default '',
 link_status text not null default 'unlinked' check(link_status in ('unlinked','candidate','verified')),
 source_name text not null, source_url text check(source_url ~ '^https?://'), as_of date,
 published boolean not null default false,
 check(not published or (building_id is not null and link_status='verified'))
);
comment on column public.transactions.unit_price_won is 'Source-reported KRW per pyeong. Do not derive from whole-building area for partial/share/portfolio purchases.';
-- Additional confirmed assets in a portfolio transaction. Allocation must be explicit.
create table public.transaction_assets (
 id uuid primary key default gen_random_uuid(),
 transaction_id uuid not null references public.transactions(id) on delete cascade,
 building_id uuid not null references public.buildings(id),
 allocated_amount_won numeric check(allocated_amount_won>=0),
 traded_area_m2 numeric check(traded_area_m2>0),
 unique(transaction_id,building_id)
);
create table public.occupancies (
 id uuid primary key default gen_random_uuid(),
 building_id uuid not null references public.buildings(id),
 company_id uuid not null references public.companies(id),
 floors text, area_m2 numeric check(area_m2>0),
 started_on date, ended_on date,
 status text not null default 'unconfirmed' check(status in ('confirmed','historical','unconfirmed')),
 source_name text not null, source_url text check(source_url ~ '^https?://'), as_of date not null,
 published boolean not null default false,
 check(ended_on is null or started_on is null or ended_on>=started_on),
 check(status<>'confirmed' or ended_on is null)
);
create table public.tenant_movements (
 id uuid primary key default gen_random_uuid(),
 company_name text not null, period text not null, kind text not null default '',
 from_building_id uuid references public.buildings(id), to_building_id uuid references public.buildings(id),
 from_name text not null default '', to_name text not null default '', industry text not null default '',
 link_status text not null default 'candidate' check(link_status in ('candidate','verified')),
 source_name text not null, source_url text check(source_url ~ '^https?://'), as_of date,
 published boolean not null default false,
 check(not published or link_status='verified')
);
create table public.leasing_quarters (
 id uuid primary key default gen_random_uuid(),
 building_id uuid not null references public.buildings(id),
 period text not null check(period ~ '^\d{4}\.[1-4]Q$'),
 deposit numeric check(deposit>=0), rent numeric check(rent>=0), fee numeric check(fee>=0), noc numeric check(noc>=0),
 vacancy numeric check(vacancy between 0 and 1), rent_free numeric check(rent_free between 0 and 12),
 area_basis text not null, vat_basis text not null,
 source_name text not null, source_url text check(source_url ~ '^https?://'), as_of date,
 published boolean not null default false,
 unique(building_id,period)
);
create table public.development_records (
 id uuid primary key default gen_random_uuid(),
 building_id uuid not null references public.buildings(id),
 year text not null default '', quarter text not null default '',
 permit text not null default '', started text not null default '', developer text not null default '', contractor text not null default '', progress text not null default '',
 source_name text not null, source_url text check(source_url ~ '^https?://'), as_of date not null,
 published boolean not null default false
);
create index transactions_asset_year on public.transactions(building_id,year desc);
create index occupancies_asset on public.occupancies(building_id,company_id);
create index movements_from_asset on public.tenant_movements(from_building_id);
create index movements_to_asset on public.tenant_movements(to_building_id);
create index development_asset on public.development_records(building_id,as_of desc);
alter table public.companies enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_assets enable row level security;
alter table public.occupancies enable row level security;
alter table public.tenant_movements enable row level security;
alter table public.leasing_quarters enable row level security;
alter table public.development_records enable row level security;
revoke all on public.companies,public.transactions,public.transaction_assets,public.occupancies,public.tenant_movements,public.leasing_quarters,public.development_records from public,anon,authenticated;
grant select on public.companies,public.transactions,public.transaction_assets,public.occupancies,public.tenant_movements,public.leasing_quarters,public.development_records to anon,authenticated;
create policy companies_read on public.companies for select to anon,authenticated using(published);
create policy transactions_read on public.transactions for select to anon,authenticated using(published and link_status='verified' and exists(select 1 from public.buildings b where b.id=building_id));
create policy transaction_assets_read on public.transaction_assets for select to anon,authenticated using(exists(select 1 from public.transactions t where t.id=transaction_id) and exists(select 1 from public.buildings b where b.id=building_id));
create policy occupancies_read on public.occupancies for select to anon,authenticated using(published and exists(select 1 from public.buildings b where b.id=building_id) and exists(select 1 from public.companies c where c.id=company_id));
create policy movements_read on public.tenant_movements for select to anon,authenticated using(published and link_status='verified' and (from_building_id is not null or to_building_id is not null) and (from_building_id is null or exists(select 1 from public.buildings b where b.id=from_building_id)) and (to_building_id is null or exists(select 1 from public.buildings b where b.id=to_building_id)));
create policy leasing_read on public.leasing_quarters for select to anon,authenticated using(published and exists(select 1 from public.buildings b where b.id=building_id));
create policy development_read on public.development_records for select to anon,authenticated using(published and exists(select 1 from public.buildings b where b.id=building_id));
commit;
