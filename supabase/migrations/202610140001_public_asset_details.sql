begin;
-- Public asset detail is an explicit read-only physical/market projection.
-- Raw tables, private masters, leases and operations keep their existing grants/RLS.
create function public.is_public_detail_asset(asset_key uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.catalog_buildings b where b.id=asset_key)
 or exists(select 1 from public.building_towers t join public.buildings b on b.id=t.building_id
   join public.building_complexes c on c.id=t.complex_id
   join public.catalog_buildings p on p.id=c.representative_building_id
   where t.building_id=asset_key and t.parent_tower_id is null and t.component_kind<>'facility'
   and t.published and c.published and b.status in ('operating','development'))
$$;
revoke all on function public.is_public_detail_asset(uuid) from public,anon,authenticated;
grant execute on function public.is_public_detail_asset(uuid) to anon,authenticated;

-- Only direct IGIS publication or a generated component of that approved
-- aggregate inherits the relationship. A complex/sibling is never sufficient.
create function public.public_detail_igis_source(asset_key uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select i.building_id from private.igis_catalog_publications i
 where public.is_public_detail_asset(asset_key) and (
  i.building_id=asset_key or exists(
   select 1 from private.complex_component_assets m
   join public.buildings parent on parent.id=m.parent_building_id
   where m.building_id=asset_key and m.parent_building_id=i.building_id
   and parent.complex_scope='aggregate'
  )) order by (i.building_id=asset_key) desc limit 1
$$;
revoke all on function public.public_detail_igis_source(uuid) from public,anon,authenticated;
grant execute on function public.public_detail_igis_source(uuid) to anon,authenticated;

create view public.detail_buildings with(security_barrier=true) as
 select r.id,r.name,r.address,r.region,r.status,r.gross_area_m2,r.area_basis,r.latitude,r.longitude,r.overview,r.floors_above,r.floors_below,r.completion_year,r.parking_spaces,r.source_name,r.source_url,r.verified_on,r.published,r.source_as_of,r.standard_address,r.road_address,r.address_status,r.typical_floor_area_pyeong,r.typical_floor_rentable_pyeong,r.typical_floor_exclusive_pyeong,r.typical_floor_source_url,r.typical_floor_source_period,r.typical_floor_collected_at,r.usage_approved_on,r.completion_source_url,r.completion_collected_at,r.typical_floor_scope,r.complex_id,r.redevelopment_building_id,r.complex_scope,case when public.is_public_detail_asset(r.component_source_building_id) then r.component_source_building_id end as component_source_building_id,(public.public_detail_igis_source(r.id) is not null) as is_igis,public.public_detail_igis_source(r.id) as igis_source_building_id,coalesce((select i.asset_category from private.igis_catalog_publications i where i.building_id=public.public_detail_igis_source(r.id)),'office') as asset_category,coalesce((select c.is_mixed_use from public.catalog_buildings c where c.id=public.public_detail_igis_source(r.id)),false) as is_mixed_use
 from public.buildings r where r.status in ('operating','development') and public.is_public_detail_asset(r.id);
revoke all on public.detail_buildings from public,anon,authenticated;
grant select on public.detail_buildings to anon,authenticated;

create view public.detail_building_complexes with(security_barrier=true) as
 select r.id,r.name,r.representative_building_id,r.gross_area_m2,r.area_method,r.published,r.area_scope,r.common_facts,r.parking_spaces,r.contracted_capacity_mw,r.dual_substation
 from public.building_complexes r where r.published and public.is_public_detail_asset(r.representative_building_id);
revoke all on public.detail_building_complexes from public,anon,authenticated;
grant select on public.detail_building_complexes to anon,authenticated;

create view public.detail_building_towers with(security_barrier=true) as
 select r.id,r.complex_id,r.building_id,r.label,r.sort_order,r.typical_floor_rentable_pyeong,r.typical_floor_exclusive_pyeong,r.source_name,r.source_url,r.source_period,r.collected_at,r.published,r.component_kind,r.parent_tower_id,r.gross_area_m2,r.net_area_m2,r.floors_above,r.floors_below,r.parking_spaces,r.contracted_capacity_mw,r.main_use,r.overview
 from public.building_towers r where exists(select 1 from public.detail_building_complexes c where c.id=r.complex_id);
revoke all on public.detail_building_towers from public,anon,authenticated;
grant select on public.detail_building_towers to anon,authenticated;

create view public.detail_building_images with(security_barrier=true) as
 select r.id,r.building_id,r.title,r.kind,r.source_name,r.source_url,r.source_date,r.captured_on,r.credit,r.license_name,r.license_url,r.rights_status,r.review_status,r.object_path,r.thumbnail_path,r.focal_x,r.focal_y,r.is_primary,r.floor_label,r.sort_order,r.zoom_percent,r.inherited_from_image_id
 from public.building_images r where public.is_public_detail_asset(r.building_id) and r.review_status='approved';
revoke all on public.detail_building_images from public,anon,authenticated;
grant select on public.detail_building_images to anon,authenticated;

create view public.detail_leasing_quarters with(security_barrier=true) as
 select r.id,r.building_id,r.period,r.deposit,r.rent,r.fee,r.noc,r.vacancy,r.rent_free,r.area_basis,r.vat_basis,r.source_name,r.source_url,r.as_of,r.published,r.data_domain,r.provider_code,r.observation_basis,r.currency_code,r.rate_area_unit
 from public.leasing_quarters r where public.is_public_detail_asset(r.building_id) and r.data_domain='market_leasing' and (r.published or exists(select 1 from private.catalog_publications p where p.record_type='leasing_quarters' and p.record_id=r.id));
revoke all on public.detail_leasing_quarters from public,anon,authenticated;
grant select on public.detail_leasing_quarters to anon,authenticated;

create view public.detail_development_records with(security_barrier=true) as
 select r.id,r.building_id,r.year,r.quarter,r.permit,r.started,r.developer,r.contractor,r.progress,r.source_name,r.source_url,r.as_of,r.published
 from public.development_records r where public.is_public_detail_asset(r.building_id) and (r.published or exists(select 1 from private.catalog_publications p where p.record_type='development_records' and p.record_id=r.id));
revoke all on public.detail_development_records from public,anon,authenticated;
grant select on public.detail_development_records to anon,authenticated;

create view public.detail_occupancies with(security_barrier=true) as
 select r.id,r.building_id,r.company_id,r.floors,r.area_m2,r.started_on,r.ended_on,r.status,r.source_name,r.source_url,r.as_of,r.published
 from public.occupancies r where public.is_public_detail_asset(r.building_id) and r.published;
revoke all on public.detail_occupancies from public,anon,authenticated;
grant select on public.detail_occupancies to anon,authenticated;

create view public.detail_tenant_movements with(security_barrier=true) as
 select r.id,r.company_name,r.period,r.kind,r.from_building_id,r.to_building_id,r.from_name,r.to_name,r.industry,r.link_status,r.source_name,r.source_url,r.as_of,r.published,r.from_source_address,r.from_standard_address,r.to_source_address,r.to_standard_address
 from public.tenant_movements r where r.published and r.link_status='verified' and (public.is_public_detail_asset(r.from_building_id) or public.is_public_detail_asset(r.to_building_id));
revoke all on public.detail_tenant_movements from public,anon,authenticated;
grant select on public.detail_tenant_movements to anon,authenticated;

create view public.detail_companies with(security_barrier=true) as
 select r.id,r.name,r.industry,r.overview,r.published
 from public.companies r where r.published or exists(select 1 from public.detail_occupancies o where o.company_id=r.id);
revoke all on public.detail_companies from public,anon,authenticated;
grant select on public.detail_companies to anon,authenticated;

create view public.detail_transactions with(security_barrier=true) as
 select r.id,r.building_id,r.building_name,r.region,r.year,r.amount_won,r.building_area_m2,r.traded_area_m2,r.unit_price_won,r.seller,r.buyer,r.scope,r.kind,r.note,r.link_status,r.source_name,r.source_url,r.as_of,r.published,r.source_address,r.standard_address,r.road_address,r.address_status
 from public.transactions r where (r.published or exists(select 1 from private.catalog_publications p where p.record_type='transactions' and p.record_id=r.id)) and (r.building_id is null or public.is_public_detail_asset(r.building_id));
revoke all on public.detail_transactions from public,anon,authenticated;
grant select on public.detail_transactions to anon,authenticated;

create view public.detail_transaction_assets with(security_barrier=true) as
 select r.id,r.transaction_id,r.building_id,r.allocated_amount_won,r.traded_area_m2
 from public.transaction_assets r where public.is_public_detail_asset(r.building_id) and exists(select 1 from public.detail_transactions t where t.id=r.transaction_id);
revoke all on public.detail_transaction_assets from public,anon,authenticated;
grant select on public.detail_transaction_assets to anon,authenticated;

create view public.detail_building_asset_profiles with(security_barrier=true) as
 select r.id,r.building_id,r.owner_name,r.ceiling_height_m,r.lease_span_m,r.office_area_m2,r.retail_area_m2,r.office_area_basis,r.retail_area_basis,r.contractor_name,r.architect_name,r.views,r.green_spaces,r.hotels,r.amenity_operators,r.retail_operators,r.subway_connections,r.certifications,r.site_area_m2,r.floor_area_ratio,r.efficiency_pct
 from public.building_asset_profiles r where public.is_public_detail_asset(r.building_id);
revoke all on public.detail_building_asset_profiles from public,anon,authenticated;
grant select on public.detail_building_asset_profiles to anon,authenticated;

create view public.detail_building_power_specs with(security_barrier=true) as
 select r.id,r.building_id,r.contracted_capacity_mw,r.dual_substation
 from public.building_power_specs r where public.is_public_detail_asset(r.building_id);
revoke all on public.detail_building_power_specs from public,anon,authenticated;
grant select on public.detail_building_power_specs to anon,authenticated;

create view public.detail_asset_certification_options with(security_barrier=true) as
 select r.code,r.scheme,r.grade,r.official_url,r.logo_url,r.sort_order
 from public.asset_certification_options r where true;
revoke all on public.detail_asset_certification_options from public,anon,authenticated;
grant select on public.detail_asset_certification_options to anon,authenticated;

create view public.detail_building_facts with(security_barrier=true) as
 select r.id,r.building_id,r.category,r.field_key,r.value,r.unit,r.as_of,r.source_name,r.source_url,r.published,r.complex_id
 from public.building_facts r where public.is_public_detail_asset(r.building_id) and r.published;
revoke all on public.detail_building_facts from public,anon,authenticated;
grant select on public.detail_building_facts to anon,authenticated;

create view public.detail_building_parcels with(security_barrier=true) as
 select r.id,r.building_id,r.pnu,r.address,r.is_primary,r.area_m2,r.land_category,r.land_use,r.terrain,r.shape,r.road_condition,r.ownership_type,r.ownership_changed_on,r.coowners,r.geometry,r.zoning,r.official_prices,r.source_name,r.source_url,r.as_of,r.collected_at,r.verified
 from public.building_parcels r where public.is_public_detail_asset(r.building_id) and r.verified;
revoke all on public.detail_building_parcels from public,anon,authenticated;
grant select on public.detail_building_parcels to anon,authenticated;

create view public.detail_building_places with(security_barrier=true) as
 select r.id,r.building_id,r.category,r.name,r.address,r.latitude,r.longitude,r.distance_m,r.walking_minutes,r.walking_source,r.source_name,r.source_url,r.as_of,r.collected_at,r.verified
 from public.building_places r where public.is_public_detail_asset(r.building_id) and r.verified;
revoke all on public.detail_building_places from public,anon,authenticated;
grant select on public.detail_building_places to anon,authenticated;

create view public.detail_building_green_spaces with(security_barrier=true) as
 select r.building_id,r.id,r.name,r.area_m2,r.source_name,r.source_url,r.as_of,r.distance_m,r.distance_basis
 from (SELECT b.id AS building_id,
    g.id,
    g.name,
    g.area_m2,
    g.source_name,
    g.source_url,
    g.as_of,
    d.distance_m,
    'reference_point'::text AS distance_basis
   FROM buildings b
     JOIN asset_green_spaces g ON g.kind = 'park'::text AND abs(b.latitude - g.latitude::double precision) < 0.005::double precision AND abs(b.longitude - g.longitude::double precision) < 0.007::double precision
     CROSS JOIN LATERAL ( SELECT (6371000 * 2)::double precision * asin(LEAST(1::double precision, sqrt(power(sin(radians(g.latitude::double precision - b.latitude) / 2::double precision), 2::double precision) + cos(radians(b.latitude)) * cos(radians(g.latitude::double precision)) * power(sin(radians(g.longitude::double precision - b.longitude) / 2::double precision), 2::double precision)))) AS distance_m) d
  WHERE b.latitude IS NOT NULL AND b.longitude IS NOT NULL AND d.distance_m <= 500::double precision) r where public.is_public_detail_asset(r.building_id);
revoke all on public.detail_building_green_spaces from public,anon,authenticated;
grant select on public.detail_building_green_spaces to anon,authenticated;

create view public.detail_building_register_links with(security_barrier=true) as
 select r.id,r.building_id,r.tower_id,r.record_id,r.status
 from public.building_register_links r where public.is_public_detail_asset(r.building_id) and r.status='verified';
revoke all on public.detail_building_register_links from public,anon,authenticated;
grant select on public.detail_building_register_links to anon,authenticated;

create view public.detail_building_register_records with(security_barrier=true) as
 select r.id,r.register_pk,r.record_kind,r.parcel_key,r.building_name,r.dong_name,r.register_type,r.register_kind,r.lot_address,r.road_address,r.main_annex_code,r.main_annex_name,r.main_use,r.other_use,r.structure,r.other_structure,r.roof,r.other_roof,r.seismic_design,r.seismic_capacity,r.energy_grade,r.green_grade,r.intelligent_grade,r.site_area_m2,r.building_area_m2,r.gross_area_m2,r.far_area_m2,r.coverage_ratio,r.floor_area_ratio,r.height_m,r.floors_above,r.floors_below,r.passenger_elevators,r.emergency_elevators,r.parking_total,r.parking_indoor_mechanical,r.parking_outdoor_mechanical,r.parking_indoor_self,r.parking_outdoor_self,r.main_buildings,r.annex_buildings,r.annex_area_m2,r.households,r.units,r.energy_saving_ratio,r.energy_epi,r.green_score,r.intelligent_score,r.permit_date,r.construction_start_date,r.approval_date,r.source_created_date,r.collected_at,r.is_current
 from public.building_register_records r where r.is_current and exists(select 1 from public.detail_building_register_links l where l.record_id=r.id);
revoke all on public.detail_building_register_records from public,anon,authenticated;
grant select on public.detail_building_register_records to anon,authenticated;

create view public.detail_building_register_floors with(security_barrier=true) as
 select r.id,r.record_id,r.source_ordinal,r.register_pk,r.dong_name,r.floor_category,r.floor_code,r.floor_number,r.floor_name,r.main_annex_name,r.structure,r.main_use,r.other_use,r.area_m2,r.area_excluded,r.source_created_date
 from public.building_register_floors r where exists(select 1 from public.detail_building_register_records b where b.id=r.record_id);
revoke all on public.detail_building_register_floors from public,anon,authenticated;
grant select on public.detail_building_register_floors to anon,authenticated;

create view public.detail_building_register_area_parts with(security_barrier=true) as
 select r.id,r.record_id,r.source_ordinal,r.register_pk,r.dong_name,r.unit_name,r.floor_category,r.floor_number,r.area_category,r.area_category_code,r.main_annex_name,r.structure,r.main_use,r.other_use,r.area_m2,r.source_created_date
 from public.building_register_area_parts r where exists(select 1 from public.detail_building_register_records b where b.id=r.record_id);
revoke all on public.detail_building_register_area_parts from public,anon,authenticated;
grant select on public.detail_building_register_area_parts to anon,authenticated;

create view public.detail_building_register_sections with(security_barrier=true) as
 select r.id,r.record_id,r.section,r.source_ordinal,r.attributes
 from public.building_register_sections r where exists(select 1 from public.detail_building_register_records b where b.id=r.record_id);
revoke all on public.detail_building_register_sections from public,anon,authenticated;
grant select on public.detail_building_register_sections to anon,authenticated;

create function public.is_public_detail_image(object_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.detail_building_images i where i.object_path=object_name or i.thumbnail_path=object_name)
$$;
revoke all on function public.is_public_detail_image(text) from public,anon,authenticated;
grant execute on function public.is_public_detail_image(text) to anon,authenticated;
alter policy building_images_storage_public_read on storage.objects using(
 bucket_id='building-images' and (public.is_catalog_thumbnail(name) or public.is_public_detail_image(name))
);
alter policy catalog_storage_anon_gate on storage.objects using(
 bucket_id<>'building-images' or public.is_catalog_thumbnail(name) or public.is_public_detail_image(name)
);
alter policy catalog_storage_member_gate on storage.objects using(
 bucket_id<>'building-images' or public.is_catalog_thumbnail(name) or public.is_public_detail_image(name) or (select public.has_workplace_permission('details.read'))
);
update private.platform_data_domains set access_boundary='public_published_detail' where key in ('market_leasing','market_transaction','physical_registry');
notify pgrst,'reload schema';
commit;
