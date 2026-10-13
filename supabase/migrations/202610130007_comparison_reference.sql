begin;
-- A received image has an ingestion timestamp, not necessarily a source as-of date.
alter table public.building_facts alter column as_of drop not null;
comment on column public.building_facts.as_of is 'Source as-of date when stated; null for undated evidence. created_at records ingestion separately.';
insert into public.asset_certification_options(code,scheme,grade,official_url,sort_order)
values('well_unspecified','WELL','등급 미기재','https://www.wellcertified.com/certification/v2/',19)
on conflict(code) do nothing;
notify pgrst,'reload schema';
commit;
