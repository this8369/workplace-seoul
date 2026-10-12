begin;
-- A separate facet preserves the primary use. Derive it from current verified
-- source links so imports and MY edits cannot leave a duplicated flag stale.
create or replace view public.catalog_buildings with(security_barrier=true) as
 select b.id,b.complex_id,b.name,b.address,b.standard_address,b.road_address,b.region,b.status,
 b.gross_area_m2,b.area_basis,b.latitude,b.longitude,b.completion_year,
 b.typical_floor_rentable_pyeong,b.typical_floor_exclusive_pyeong,b.typical_floor_scope,
 b.typical_floor_source_period,
 (i.building_id is not null) as is_igis,coalesce(i.asset_category,'office') as asset_category,
 (i.building_id is not null and (i.asset_category='mixed' or exists (
   select 1 from private.master_assets a
   join private.master_investment_objects o on o.asset_id=a.id
   where a.existing_building_id=b.id
     and o.resolution_status='verified_source_evidence'
     and o.source_sold_flag=false
     and o.underlying_sector like '%복합%'
 ))) as is_mixed_use
 from public.buildings b
 left join private.igis_catalog_publications i on i.building_id=b.id
 where b.status in ('operating','development') and
 (i.building_id is not null or exists(select 1 from private.catalog_publications p where p.record_type='buildings' and p.record_id=b.id));
comment on view public.catalog_buildings is 'Approved public discovery fields including primary asset category and a separate mixed-use flag. Raw source, fund and financial data remain private.';
notify pgrst,'reload schema';
commit;
