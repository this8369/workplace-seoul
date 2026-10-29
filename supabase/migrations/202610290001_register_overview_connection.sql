begin;
-- Read-through physical facts: manual values remain in their original tables.
-- Only reviewed, current links can supply a missing overview value.
create view public.detail_building_register_overview with(security_barrier=true) as
with assets as (
 select b.id,b.status,b.complex_scope,b.component_source_building_id,
   c.id complex_id,c.representative_building_id,
   coalesce(c.representative_building_id,b.id) common_source_id
 from public.buildings b left join public.building_complexes c on c.id=b.complex_id and c.published
 where public.is_public_detail_asset(b.id)
), linked as (
 select l.building_id,r.*,
   count(*) filter(where r.record_kind='complex') over(partition by l.building_id) recap_count,
   count(*) filter(where r.record_kind='building') over(partition by l.building_id) title_count
 from public.building_register_links l join public.building_register_records r on r.id=l.record_id
 where l.status='verified' and r.is_current
), chosen as (
 select a.*,o.id own_record_id,o.gross_area_m2,o.floors_above,o.floors_below,o.approval_date,
   s.id common_record_id,s.site_area_m2,s.floor_area_ratio,
   case when s.parking_total>=0 then s.parking_total
     when s.parking_indoor_self>=0 and s.parking_outdoor_self>=0
      and s.parking_indoor_mechanical>=0 and s.parking_outdoor_mechanical>=0
      and s.parking_indoor_self+s.parking_outdoor_self+s.parking_indoor_mechanical+s.parking_outdoor_mechanical>0
     then s.parking_indoor_self+s.parking_outdoor_self+s.parking_indoor_mechanical+s.parking_outdoor_mechanical
   end parking_spaces
 from assets a
 left join lateral (
   select r.* from linked r where r.building_id=a.id and a.status='operating' and (
     (a.complex_scope='component' and r.record_kind='building' and r.title_count=1)
     or (a.complex_scope is distinct from 'component' and (
       (r.record_kind='complex' and r.recap_count=1)
       or (r.record_kind='building' and r.recap_count=0 and r.title_count=1)
     ))
   ) limit 1
 ) o on true
 left join lateral (
   select r.* from linked r join public.buildings source on source.id=r.building_id
   where r.building_id=a.common_source_id and a.status='operating' and (
     (r.record_kind='complex' and r.recap_count=1)
     or (r.record_kind='building' and r.recap_count=0 and r.title_count=1
       and (a.complex_id is null or source.complex_scope='aggregate'))
   ) limit 1
 ) s on true
)
select id,own_record_id,common_record_id,
 case when gross_area_m2>0 then gross_area_m2 end gross_area_m2,
 case when floors_above>0 and floors_above=trunc(floors_above) then floors_above::integer end floors_above,
 case when floors_below>=0 and floors_below=trunc(floors_below) then floors_below::integer end floors_below,
 case when site_area_m2>0 then site_area_m2 end site_area_m2,
 case when floor_area_ratio>0 then floor_area_ratio end floor_area_ratio,
 case when parking_spaces>=0 and parking_spaces=trunc(parking_spaces) then parking_spaces::integer end parking_spaces,
 approval_date usage_approved_on,extract(year from approval_date)::integer completion_year
from chosen;
comment on view public.detail_building_register_overview is 'Live fallback from verified current registers. Component GFA/floors/approval never inherit a complex total. Common facts require whole-complex evidence; all-zero parking breakdown is unknown. Manual overrides live in buildings/profiles/complexes and take precedence in detail projections.';
revoke all on public.detail_building_register_overview from public,anon,authenticated;
grant select on public.detail_building_register_overview to anon,authenticated;

create or replace view public.detail_buildings with(security_barrier=true) as
 select r.id,r.name,r.address,r.region,r.status,coalesce(r.gross_area_m2,f.gross_area_m2)::numeric(16,6) gross_area_m2,r.area_basis,r.latitude,r.longitude,r.overview,coalesce(r.floors_above,f.floors_above) floors_above,coalesce(r.floors_below,f.floors_below) floors_below,coalesce(r.completion_year,f.completion_year) completion_year,coalesce(r.parking_spaces,f.parking_spaces) parking_spaces,r.source_name,r.source_url,r.verified_on,r.published,r.source_as_of,r.standard_address,r.road_address,r.address_status,r.typical_floor_area_pyeong,r.typical_floor_rentable_pyeong,r.typical_floor_exclusive_pyeong,r.typical_floor_source_url,r.typical_floor_source_period,r.typical_floor_collected_at,coalesce(r.usage_approved_on,case when r.completion_year is null or r.completion_year=f.completion_year then f.usage_approved_on end) usage_approved_on,r.completion_source_url,r.completion_collected_at,r.typical_floor_scope,r.complex_id,r.redevelopment_building_id,r.complex_scope,case when public.is_public_detail_asset(r.component_source_building_id) then r.component_source_building_id end as component_source_building_id,(public.public_detail_igis_source(r.id) is not null) as is_igis,public.public_detail_igis_source(r.id) as igis_source_building_id,coalesce((select i.asset_category from private.igis_catalog_publications i where i.building_id=public.public_detail_igis_source(r.id)),'office') as asset_category,coalesce((select c.is_mixed_use from public.catalog_buildings c where c.id=public.public_detail_igis_source(r.id)),false) as is_mixed_use
 from public.buildings r left join public.detail_building_register_overview f on f.id=r.id
 where r.status in ('operating','development') and public.is_public_detail_asset(r.id);

create or replace view public.detail_building_asset_profiles with(security_barrier=true) as
 select r.id,r.building_id,r.owner_name,r.ceiling_height_m,r.lease_span_m,r.office_area_m2,r.retail_area_m2,r.office_area_basis,r.retail_area_basis,r.contractor_name,r.architect_name,r.views,r.green_spaces,r.hotels,r.amenity_operators,r.retail_operators,r.subway_connections,r.certifications,coalesce(r.site_area_m2,f.site_area_m2)::numeric(18,4) site_area_m2,coalesce(r.floor_area_ratio,f.floor_area_ratio)::numeric(12,4) floor_area_ratio,r.efficiency_pct
 from public.building_asset_profiles r left join public.detail_building_register_overview f on f.id=r.building_id
 where public.is_public_detail_asset(r.building_id);

create or replace view public.detail_building_complexes with(security_barrier=true) as
 select r.id,r.name,r.representative_building_id,r.gross_area_m2,r.area_method,r.published,r.area_scope,r.common_facts,coalesce(r.parking_spaces,f.parking_spaces) parking_spaces,r.contracted_capacity_mw,r.dual_substation
 from public.building_complexes r left join public.detail_building_register_overview f on f.id=r.representative_building_id
 where r.published and public.is_public_detail_asset(r.representative_building_id);
notify pgrst,'reload schema';
commit;
