begin;

alter table public.building_asset_profiles
 add column heating_cooling text check(length(heating_cooling)<=2000),
 add column other_facilities text check(length(other_facilities)<=2000);

create or replace view public.detail_building_asset_profiles with(security_barrier=true) as
 select r.id,r.building_id,r.owner_name,r.ceiling_height_m,r.lease_span_m,r.office_area_m2,r.retail_area_m2,r.office_area_basis,r.retail_area_basis,r.contractor_name,r.architect_name,r.views,r.green_spaces,r.hotels,r.amenity_operators,r.retail_operators,r.subway_connections,r.certifications,coalesce(r.site_area_m2,f.site_area_m2)::numeric(18,4) site_area_m2,coalesce(r.floor_area_ratio,f.floor_area_ratio)::numeric(12,4) floor_area_ratio,r.efficiency_pct,r.heating_cooling,r.other_facilities
 from public.building_asset_profiles r left join lateral (select * from public.detail_building_register_overview f where f.id=r.id limit 1) f on true
 where public.is_public_detail_asset(r.id);

notify pgrst,'reload schema';
commit;
