-- Deliberate production operation. Run the complete file in a single session.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Serialize against new classifications, fund imports and review changes.
lock table private.igis_catalog_publications, private.master_assets,
  private.master_investment_objects, private.data_record_history,
  private.data_history_deletions, private.data_change_requests
  in share row exclusive mode;

create temporary table igis_public_classification_before on commit drop as
select id, is_igis, asset_category, is_mixed_use from public.catalog_buildings;

-- Preserve only the approved building classification. Some publication
-- evidence contains internal investment object IDs.
alter table private.igis_catalog_publications
  add column if not exists is_mixed_use boolean not null default false;

update private.igis_catalog_publications i
set is_mixed_use = i.is_mixed_use or i.asset_category = 'mixed' or exists (
  select 1 from private.master_assets a
  join private.master_investment_objects o on o.asset_id = a.id
  where a.existing_building_id = i.building_id
    and o.resolution_status = 'verified_source_evidence'
    and o.source_sold_flag = false
    and o.underlying_sector like '%복합%'
), evidence = '{}'::jsonb;

create or replace view public.catalog_buildings with (security_barrier = true) as
select b.id, b.complex_id, b.name, b.address, b.standard_address, b.road_address,
  b.region, b.status, b.gross_area_m2, b.area_basis, b.latitude, b.longitude,
  b.completion_year, b.typical_floor_rentable_pyeong, b.typical_floor_exclusive_pyeong,
  b.typical_floor_scope, b.typical_floor_source_period,
  (i.building_id is not null) as is_igis, coalesce(i.asset_category, 'office') as asset_category,
  coalesce(i.is_mixed_use or i.asset_category = 'mixed', false) as is_mixed_use
from public.buildings b
left join private.igis_catalog_publications i on i.building_id = b.id
where b.status in ('operating','development') and (
  i.building_id is not null or exists (
    select 1 from private.catalog_publications p where p.record_type = 'buildings' and p.record_id = b.id
  )
);

-- Only investment records are removed from the shared review and history tables.
create temporary table igis_fund_history_to_remove on commit drop as
select id from private.data_record_history
where master_history_id is not null or entity ~ '^(master_|igis_)';

delete from private.data_history_deletions d using igis_fund_history_to_remove h
where d.history_id = h.id;

alter table private.data_record_history disable trigger data_history_immutable;
delete from private.data_record_history r using igis_fund_history_to_remove h
where r.id = h.id;
alter table private.data_record_history enable trigger data_history_immutable;

delete from private.data_change_requests where entity ~ '^(master_|igis_)';

-- Explicit table list and RESTRICT prevent accidental deletion from other domains.
truncate table
  private.igis_asset_valuations,
  private.igis_cash_entries,
  private.igis_lease_contracts,
  private.igis_lease_terms,
  private.igis_operating_periods,
  private.igis_operating_plans,
  private.igis_operation_grants,
  private.igis_operation_grant_history,
  private.igis_operation_history,
  private.master_access,
  private.master_aliases,
  private.master_asset_components,
  private.master_asset_links,
  private.master_asset_units,
  private.master_assets,
  private.master_aum_snapshots,
  private.master_beneficiary_positions,
  private.master_business_locations,
  private.master_change_history,
  private.master_company_financials,
  private.master_field_dictionary,
  private.master_identifiers,
  private.master_import_batches,
  private.master_import_files,
  private.master_investment_objects,
  private.master_investments,
  private.master_loan_contracts,
  private.master_loan_positions,
  private.master_occupancies,
  private.master_organizations,
  private.master_parties,
  private.master_party_relationships,
  private.master_party_roles,
  private.master_review_issues,
  private.master_source_rows,
  private.master_team_assignments,
  private.master_vehicle_relationships,
  private.master_vehicles
restrict;

-- Roll back the whole operation if any public catalog item or classification changes.
do $$
begin
  if exists (
    (select * from igis_public_classification_before except
     select id, is_igis, asset_category, is_mixed_use from public.catalog_buildings)
    union all
    (select id, is_igis, asset_category, is_mixed_use from public.catalog_buildings except
     select * from igis_public_classification_before)
  ) then raise exception 'Public asset classifications changed'; end if;
end $$;

notify pgrst, 'reload schema';
commit;
