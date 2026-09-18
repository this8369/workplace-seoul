begin;
-- Source addresses remain immutable; canonical values have a separate provenance.
alter table public.buildings
 add column standard_address text,
 add column road_address text,
 add column address_status text not null default 'unreviewed' check(address_status in ('unreviewed','exact','needs_review')),
 add column address_checked_at timestamptz,
 add column address_provider text;
comment on column public.buildings.address is 'Original source address. Do not overwrite during normalization.';
comment on column public.buildings.address_status is 'exact = exact lot match from geocoder, not independent verification of building identity/entrance.';
alter table public.transactions add column source_address text, add column standard_address text, add column road_address text, add column address_status text;
alter table public.tenant_movements add column from_source_address text, add column from_standard_address text, add column to_source_address text, add column to_standard_address text;
commit;
