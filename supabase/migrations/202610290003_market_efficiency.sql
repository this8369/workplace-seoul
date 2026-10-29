begin;
-- Keep the denominator beside the market observation it came with. A later
-- building-profile correction must not rewrite an older market observation.
alter table public.leasing_quarters
 add column efficiency_pct numeric(7,4) check(efficiency_pct>0 and efficiency_pct<=100),
 add column efficiency_source_period text,
 add column efficiency_source_scope text;
comment on column public.leasing_quarters.efficiency_pct is 'Source-reported exclusive/rentable percentage from the same source row as these market rates. Never infer from NOC, office/gross area, or a different tower.';
comment on column public.leasing_quarters.efficiency_source_period is 'Period of the source efficiency observation, not necessarily the historical lease quarter. Preserve month precision.';
comment on column public.leasing_quarters.efficiency_source_scope is 'Original source asset/floor scope; aggregate and selected-floor values must not become whole-building or sibling-tower facts.';
create or replace view public.detail_leasing_quarters with(security_barrier=true) as
 select r.id,r.building_id,r.period,r.deposit,r.rent,r.fee,r.noc,r.vacancy,r.rent_free,r.area_basis,r.vat_basis,r.source_name,r.source_url,r.as_of,r.published,r.data_domain,r.provider_code,r.observation_basis,r.currency_code,r.rate_area_unit,
 r.efficiency_pct,r.efficiency_source_period,r.efficiency_source_scope
 from public.leasing_quarters r where public.is_public_detail_asset(r.building_id) and r.data_domain='market_leasing' and (r.published or exists(select 1 from private.catalog_publications p where p.record_type='leasing_quarters' and p.record_id=r.id));
notify pgrst,'reload schema';
commit;
