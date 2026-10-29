begin;
-- Correlate each registry lookup to the requested asset before the security
-- barrier. A generic outer join could rescan all public assets for every tower.
-- Profile IDs equal building IDs by a table constraint; use the filtered PK.
create or replace view public.detail_buildings with(security_barrier=true) as
 select r.id,r.name,r.address,r.region,r.status,coalesce(r.gross_area_m2,f.gross_area_m2)::numeric(16,6) gross_area_m2,r.area_basis,r.latitude,r.longitude,r.overview,coalesce(r.floors_above,f.floors_above) floors_above,coalesce(r.floors_below,f.floors_below) floors_below,coalesce(r.completion_year,f.completion_year) completion_year,coalesce(r.parking_spaces,f.parking_spaces) parking_spaces,r.source_name,r.source_url,r.verified_on,r.published,r.source_as_of,r.standard_address,r.road_address,r.address_status,r.typical_floor_area_pyeong,r.typical_floor_rentable_pyeong,r.typical_floor_exclusive_pyeong,r.typical_floor_source_url,r.typical_floor_source_period,r.typical_floor_collected_at,coalesce(r.usage_approved_on,case when r.completion_year is null or r.completion_year=f.completion_year then f.usage_approved_on end) usage_approved_on,r.completion_source_url,r.completion_collected_at,r.typical_floor_scope,r.complex_id,r.redevelopment_building_id,r.complex_scope,case when public.is_public_detail_asset(r.component_source_building_id) then r.component_source_building_id end as component_source_building_id,(public.public_detail_igis_source(r.id) is not null) as is_igis,public.public_detail_igis_source(r.id) as igis_source_building_id,coalesce((select i.asset_category from private.igis_catalog_publications i where i.building_id=public.public_detail_igis_source(r.id)),'office') as asset_category,coalesce((select c.is_mixed_use from public.catalog_buildings c where c.id=public.public_detail_igis_source(r.id)),false) as is_mixed_use
 from public.buildings r left join lateral (select * from public.detail_building_register_overview f where f.id=r.id limit 1) f on true
 where r.status in ('operating','development') and public.is_public_detail_asset(r.id);

create or replace view public.detail_building_asset_profiles with(security_barrier=true) as
 select r.id,r.building_id,r.owner_name,r.ceiling_height_m,r.lease_span_m,r.office_area_m2,r.retail_area_m2,r.office_area_basis,r.retail_area_basis,r.contractor_name,r.architect_name,r.views,r.green_spaces,r.hotels,r.amenity_operators,r.retail_operators,r.subway_connections,r.certifications,coalesce(r.site_area_m2,f.site_area_m2)::numeric(18,4) site_area_m2,coalesce(r.floor_area_ratio,f.floor_area_ratio)::numeric(12,4) floor_area_ratio,r.efficiency_pct
 from public.building_asset_profiles r left join lateral (select * from public.detail_building_register_overview f where f.id=r.id limit 1) f on true
 where public.is_public_detail_asset(r.id);

create or replace view public.detail_building_complexes with(security_barrier=true) as
 select r.id,r.name,r.representative_building_id,r.gross_area_m2,r.area_method,r.published,r.area_scope,r.common_facts,coalesce(r.parking_spaces,f.parking_spaces) parking_spaces,r.contracted_capacity_mw,r.dual_substation
 from public.building_complexes r left join lateral (select * from public.detail_building_register_overview f where f.id=r.representative_building_id limit 1) f on true
 where r.published and public.is_public_detail_asset(r.representative_building_id);
notify pgrst,'reload schema';
commit;
