import { pathToFileURL } from "node:url";
import {
  igisSampleFund as sample,
  igisSampleMetrics as metrics,
} from "../../src/lib/igis-sample-fund.ts";

const id = (index) =>
  `f0000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const [fundId, assetId, investmentId] = [id(1), id(2), id(3)];
const iso = (date) => date.replaceAll(".", "-");
const won = (hundredMillions) =>
  String(Math.round(hundredMillions * 100_000_000));
const record = (index, fields) => ({ id: id(index), revision: 1, ...fields });
const source = {
  source_system: "가상 샘플",
  source_exported_on: iso(sample.asOf),
};
const money = { currency_code: "KRW", ...source };
const fundName = `${sample.name} (가상 샘플)`;
const fundLink = {
  vehicle_id: fundId,
  vehicle_name: fundName,
  vehicle_label: fundName,
  ...money,
};
const asset = record(2, {
  name: sample.asset.name,
  country_code: "KR",
  asset_kind: "office",
  primary_use: "업무시설",
  gross_area_m2: sample.asset.grossArea,
  completion_year: 2022,
  lifecycle_status: "operating",
  description: "가상 샘플 · 업무시설과 근린생활시설",
  ...source,
});
const fund = record(1, {
  name: fundName,
  source_code: sample.code,
  short_name: "가상 펀드 01",
  vehicle_kind: "일반사모 부동산투자신탁",
  operation_status: "운용",
  investment_sector: "오피스",
  strategy: "안정형 오피스 운영",
  geographic_scope: "국내",
  established_on: iso(sample.fund.establishedOn),
  inception_on: iso(sample.asset.acquiredOn),
  maturity_on: iso(sample.fund.maturity),
  source_asset_summary: sample.asset.name,
  source_beneficiary_summary: sample.investors
    .map((row) => row.name)
    .join(" · "),
  source_lender_summary: sample.loans.map((row) => row.lender).join(" · "),
  ...money,
});
const investmentObject = record(3, {
  asset_id: assetId,
  name: sample.asset.name,
  source_code: "DEMO-ASSET-01",
  object_kind: "physical_property",
  geographic_scope: "국내",
  underlying_sector: "오피스",
  business_stage: "운영",
  gross_area_m2: sample.asset.grossArea,
  exclusive_area_m2: sample.asset.exclusiveArea,
  floors_below: 6,
  floors_above: 28,
  acquisition_price: won(sample.asset.acquisitionPrice),
  acquisition_on: iso(sample.asset.acquiredOn),
  appraisal_amount: won(sample.asset.valuation),
  loan_amount: won(metrics.debt),
  ...money,
});
const operation = (index, fields) =>
  record(index, {
    asset_id: assetId,
    vehicle_id: fundId,
    currency_code: "KRW",
    scope_basis: "whole_asset",
    source_reference: sample.code,
    note: "가상 샘플",
    ...fields,
  });
const noi = (row) => won(row.rent + row.otherRevenue - row.expenses);

const rows = {
  master_vehicles: [fund],
  master_assets: [asset],
  master_investment_objects: [investmentObject],
  master_investments: [
    record(4, {
      ...fundLink,
      object_id: investmentId,
      object_name: asset.name,
      acquisition_price: won(sample.asset.acquisitionPrice),
      investment_amount: won(sample.fund.fundedCapital),
      ownership_pct: 100,
    }),
  ],
  master_parties: [
    ...sample.investors.map((row) => row.name),
    ...sample.loans.map((row) => row.lender),
    sample.fund.manager,
    sample.fund.trustee,
    sample.fund.administrator,
  ].map((name, index) =>
    record(10 + index, {
      name,
      party_kind: "가상 기관",
      country_code: "KR",
      confidential: false,
      ...source,
    }),
  ),
  master_beneficiary_positions: sample.investors.map((row, index) =>
    record(20 + index, {
      ...fundLink,
      investor_party_id: id(10 + index),
      beneficiary_name: row.name,
      investor_category: row.tranche,
      commitment_amount: won(row.committed),
      funded_amount: won(row.funded),
      unfunded_amount: won(row.committed - row.funded),
      reported_pct: (
        (row.committed / sample.fund.committedCapital) *
        100
      ).toFixed(2),
      as_of: iso(sample.asOf),
    }),
  ),
  master_loan_positions: sample.loans.map((row, index) =>
    record(30 + index, {
      ...fundLink,
      lender_party_id: id(10 + sample.investors.length + index),
      lender_name: row.lender,
      tranche: row.name,
      commitment_amount: won(row.committed),
      drawn_amount: won(row.balance),
      undrawn_amount: won(row.committed - row.balance),
      interest_rate_pct: row.rate,
      all_in_rate_pct: row.rate,
      maturity_on: iso(row.maturity),
      note: row.repayment,
      as_of: iso(sample.asOf),
    }),
  ),
  master_aum_snapshots: [
    record(40, {
      ...fundLink,
      administrator_as_of: iso(sample.asOf),
      net_asset_value: won(metrics.nav),
      committed_equity: won(sample.fund.committedCapital),
      funded_equity: won(sample.fund.fundedCapital),
      committed_loan: won(
        sample.loans.reduce((sum, row) => sum + row.committed, 0),
      ),
      funded_loan: won(metrics.debt),
      funded_aum: won(sample.asset.valuation),
      source_beneficiary_summary: fund.source_beneficiary_summary,
      source_lender_summary: fund.source_lender_summary,
    }),
  ],
  igis_lease_contracts: sample.leases.map((row, index) =>
    operation(50 + index, {
      contract_reference: `가상 계약 ${index + 1} · ${row.name}`,
      signed_on: "2025-06-01",
      started_on: "2025-07-01",
      ended_on: iso(row.expiresOn),
      status: "active",
    }),
  ),
  igis_lease_terms: sample.leases.map((row, index) =>
    operation(60 + index, {
      contract_id: id(50 + index),
      effective_from: "2025-07-01",
      effective_to: iso(row.expiresOn),
      leased_area_m2: row.area,
      area_basis: "exclusive",
      deposit_amount: won(row.deposit),
      monthly_rent_amount: won(row.rent),
      monthly_management_fee: won(row.fee),
      vat_basis: "excluded",
      rent_free_months: 1,
      rent_free_basis: "contract_total",
    }),
  ),
  igis_operating_periods: sample.operations.slice(0, 2).map((row, index) =>
    operation(70 + index, {
      period_start: `${row.period.slice(0, 4)}-01-01`,
      period_end: `${row.period.slice(0, 4)}-12-31`,
      accounting_basis: "accrual",
      rental_revenue: won(row.rent),
      other_revenue: won(row.otherRevenue),
      operating_expense: won(row.expenses),
      noi_amount: noi(row),
      noi_definition: "임대수익 + 기타수익 − 운영비용",
      capital_expenditure: won(row.capex),
      occupied_area_m2: (sample.asset.exclusiveArea * metrics.occupancy) / 100,
      rentable_area_m2: sample.asset.exclusiveArea,
    }),
  ),
  igis_cash_entries: sample.cashEntries.map((row, index) =>
    operation(80 + index, {
      transaction_reference: `가상 입출금 ${index + 1}`,
      occurred_on: iso(row.date),
      direction: row.type === "입금" ? "in" : "out",
      category: ["rent", "operating_expense", "other"][index],
      amount: won(row.amount),
      note: row.description,
    }),
  ),
  igis_operating_plans: sample.operations.slice(2).map((row) =>
    operation(90, {
      scenario_name: "2026년 가상 운영계획",
      version_no: 1,
      plan_kind: "budget",
      period_start: "2026-01-01",
      period_end: "2026-12-31",
      rental_revenue: won(row.rent),
      operating_expense: won(row.expenses),
      noi_amount: noi(row),
      noi_definition: "임대수익 + 기타수익 − 운영비용",
      assumptions: "임대율 96%, 운영비 82억 원, 시설투자 34억 원",
    }),
  ),
  igis_asset_valuations: sample.valuations.map((row, index) =>
    operation(100 + index, {
      valued_on: iso(row.date),
      value_kind: "appraisal",
      amount: won(row.value),
      method: row.method,
    }),
  ),
};

// The already-deployed UI calls these signatures. Their bodies only read the
// fixture and the existing member/publication checks. Write grants stay closed.
export function igisSampleApiSql() {
  return `begin;
set local lock_timeout = '5s';
create or replace function private.igis_sample_rows() returns jsonb
language sql immutable set search_path = '' as $fn$
  select $sample_data$${JSON.stringify(rows)}$sample_data$::jsonb
$fn$;
revoke all on function private.igis_sample_rows() from public, anon, authenticated, service_role;

create or replace function public.master_asset_context(building_key uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare fixture jsonb = private.igis_sample_rows();
begin
  if not public.has_workplace_permission('details.read') then raise exception 'master_read_denied'; end if;
  if public.public_detail_igis_source(building_key) is null then
    return jsonb_build_object('objects', '[]'::jsonb, 'vehicles', '[]'::jsonb);
  end if;
  return jsonb_build_object('objects', fixture->'master_investment_objects', 'vehicles', fixture->'master_vehicles');
end $$;

create or replace function public.master_query_records(entity_type text, search_text text default '',
  page_limit integer default 30, page_offset integer default 0, vehicle_key uuid default null,
  party_key uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.has_workplace_permission('details.read') then raise exception 'master_read_denied'; end if;
  if page_limit is null or page_limit not between 1 and 100 or page_offset is null
    or page_offset not between 0 and 100000 or length(search_text) > 200 then raise exception 'invalid_page'; end if;
  select coalesce(jsonb_agg(q.item order by q.position), '[]'::jsonb) into result from (
    select item, position from jsonb_array_elements(case when entity_type like 'master\\_%'
      then coalesce(private.igis_sample_rows()->entity_type, '[]'::jsonb) else '[]'::jsonb end)
      with ordinality as r(item,position)
    where (vehicle_key is null or vehicle_key = '${fundId}')
      and (party_key is null or party_key::text in (item->>'id', item->>'investor_party_id', item->>'lender_party_id'))
      and (coalesce(search_text, '') = '' or strpos(lower(item::text), lower(search_text)) > 0)
    order by position limit page_limit offset page_offset
  ) q;
  return jsonb_build_object('records', result, 'limit', page_limit, 'offset', page_offset);
end $$;

create or replace function public.igis_operation_access(building_key uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_workplace_permission('details.read') then raise exception 'operation_read_denied'; end if;
  if public.public_detail_igis_source(building_key) is null then return '{"scopes":[]}'::jsonb; end if;
  return jsonb_build_object('scopes', (select jsonb_agg(jsonb_build_object(
    'asset_id', '${assetId}', 'vehicle_id', '${fundId}', 'vehicle_name', '가상 펀드 01',
    'domain', domain, 'can_write', false) order by sort_order)
    from (values ('lease_contract',1),('operating_actual',2),('operating_plan',3),('valuation',4)) d(domain,sort_order)));
end $$;

create or replace function public.igis_operation_records(entity text, asset_key uuid,
  vehicle_key uuid default null, page_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_workplace_permission('details.read') or asset_key is distinct from '${assetId}'::uuid
    or vehicle_key is distinct from '${fundId}'::uuid then raise exception 'operation_read_denied'; end if;
  if page_offset is null or page_offset not between 0 and 100000 then raise exception 'invalid_page'; end if;
  return (select coalesce(jsonb_agg(q.item order by q.position), '[]'::jsonb) from (
    select item, position from jsonb_array_elements(case when entity like 'igis\\_%'
      then coalesce(private.igis_sample_rows()->entity, '[]'::jsonb) else '[]'::jsonb end)
      with ordinality as r(item,position)
    order by position limit 30 offset page_offset
  ) q);
end $$;

create or replace function public.igis_operation_record_history(entity text, record_key uuid,
  page_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare item jsonb;
begin
  if not public.has_workplace_permission('details.read') then raise exception 'operation_read_denied'; end if;
  if page_offset is distinct from 0 or entity not like 'igis\\_%' then return '[]'::jsonb; end if;
  select r into item from jsonb_array_elements(coalesce(private.igis_sample_rows()->entity, '[]'::jsonb)) r
  where r->>'id' = record_key::text;
  if item is null then return '[]'::jsonb; end if;
  return jsonb_build_array(jsonb_build_object('id',record_key,'changed_at','${iso(sample.asOf)}T00:00:00Z',
    'reason','가상 샘플 등록','before',null,'after',item));
end $$;

revoke all on function public.master_asset_context(uuid),
  public.master_query_records(text,text,integer,integer,uuid,uuid), public.igis_operation_access(uuid),
  public.igis_operation_records(text,uuid,uuid,integer), public.igis_operation_record_history(text,uuid,integer)
from public, anon, authenticated, service_role;
grant execute on function public.master_asset_context(uuid),
  public.master_query_records(text,text,integer,integer,uuid,uuid), public.igis_operation_access(uuid),
  public.igis_operation_records(text,uuid,uuid,integer), public.igis_operation_record_history(text,uuid,integer)
to authenticated;

notify pgrst, 'reload schema';
commit;
`;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.stdout.write(igisSampleApiSql());
}
