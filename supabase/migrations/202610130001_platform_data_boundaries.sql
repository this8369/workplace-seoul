begin;
-- Workplace is the parent model. Imported fund workbooks remain immutable evidence.
create table private.platform_data_domains (
 key text primary key, label text not null, access_boundary text not null,
 value_basis text not null, canonical_relations text[] not null,
 separation_rule text not null
);
insert into private.platform_data_domains values
 ('market_leasing','시장 임대조건','catalog_summary_member_detail','external_market_observation',array['public.leasing_quarters'],'알스퀘어 시장 조사값. 실제 계약·수납·운영실적과 자동 대체·합산 금지'),
 ('lease_contract','이지스 실제 임대차','igis_scoped','contractual',array['private.igis_lease_contracts','private.igis_lease_terms'],'계약 조건과 청구액·수납액·실현 수익을 구분'),
 ('operating_actual','이지스 운영실적','igis_scoped','actual',array['private.igis_operating_periods','private.igis_cash_entries'],'발생주의 실적과 현금 수납·지급은 별도. 시장 NOC와 혼합 금지'),
 ('operating_plan','이지스 예산·전망','igis_scoped','forecast',array['private.igis_operating_plans'],'계획·예산·전망은 실적과 별도 저장. 시나리오·판본별 조회'),
 ('valuation','이지스 자산평가','igis_scoped','valuation',array['private.igis_asset_valuations'],'감정평가·장부가·추정 시장가·매각 목표가 구분. 매매사례와 자동 대체 금지'),
 ('market_transaction','시장 매매사례','catalog_summary_member_detail','reported_transaction',array['public.transactions','public.transaction_assets'],'거래가격과 펀드 취득원가·실제 지급액 분리. 지분·동·전체 거래 범위 보존'),
 ('physical_registry','공적 물리정보','member_detail','official_register',array['public.building_register_records','public.building_register_floors','public.building_register_area_parts'],'대장 면적·계획 면적·계약 임대면적, 준공예정·준공·사용승인 구분. 원본 직접수정 금지'),
 ('fund_report','펀드 보고서','master_permission','reported_snapshot',array['private.master_aum_snapshots','private.master_beneficiary_positions','private.master_loan_positions'],'약정·납입·잔액·AUM·NAV 분리. 입력일·사무수탁사 기준일·실제 기준일 분리'),
 ('company_financial','기업 공시·재무','master_permission','reported_financial',array['private.master_company_financials'],'법인·회계기간·연결/별도·통화·단위 구분. 임차 건물의 실적과 혼합 금지');
alter table private.platform_data_domains enable row level security;
revoke all on private.platform_data_domains from public,anon,authenticated;
grant select on private.platform_data_domains to service_role;

alter table public.leasing_quarters
 add column data_domain text not null default 'market_leasing' check(data_domain='market_leasing'),
 add column provider_code text not null default 'unconfirmed',
 add column observation_basis text not null default 'market_survey' check(observation_basis='market_survey'),
 add column currency_code text not null default 'KRW' check(currency_code='KRW'),
 add column rate_area_unit text not null default 'pyeong' check(rate_area_unit='pyeong'),
 add column provider_confirmation text;
-- Preserve the latest general review rules; classification isn't an ordinary MY edit.
create or replace function private.review_business_field(entity text,field text) returns boolean language sql stable security definer set search_path='' as $$
 select field is not null and field not in ('id','revision','created_at','updated_at','updated_by','published','visibility','review_status','verified','is_current','source_row_id','source_system','source_exported_on','reviewed_by','reviewed_at','object_path','thumbnail_path','confidential','resolution_status','collected_at','source_ordinal','data_domain','provider_code','provider_confirmation','observation_basis','rate_area_unit')
 and not(entity='leasing_quarters' and field='currency_code')
 and field !~ '_id$' and exists(select 1 from information_schema.columns where table_schema=private.review_schema(entity) and table_name=entity and column_name=field)
$$;

select set_config('app.review_reason','원본 제공자 확인: 기존 임대료 자료는 알스퀘어 집계 시장 데이터. 값은 변경하지 않음.',true),
 set_config('app.review_origin','data_classification',true);
update public.leasing_quarters set provider_code='rsquare',
 provider_confirmation='user_confirmed_2026-10-13';
comment on table public.leasing_quarters is 'Market survey observations only. Existing rows confirmed as RSQUARE market data on 2026-10-13. Never store private contract rents, collections or operating results here.';
comment on column public.leasing_quarters.source_name is 'Original source caption preserved; provider_code identifies the confirmed upstream provider.';
comment on column public.leasing_quarters.noc is 'External market NOC in KRW/pyeong. Not actual rental income, NOI, or a private contract rent.';

-- Keep existing view columns/order compatible; expose classification, never private facts.
create or replace view public.catalog_leasing with(security_barrier=true) as
 select l.id,l.building_id,l.period,l.noc,l.area_basis,l.vat_basis,
 l.data_domain,l.provider_code,l.observation_basis,l.currency_code,l.rate_area_unit
 from public.leasing_quarters l join private.catalog_publications p on p.record_type='leasing_quarters' and p.record_id=l.id
 join public.catalog_buildings b on b.id=l.building_id
 where l.data_domain='market_leasing' and l.period=(select max(q.period) from public.leasing_quarters q join private.catalog_publications a on a.record_type='leasing_quarters' and a.record_id=q.id where q.data_domain='market_leasing');

notify pgrst,'reload schema';
commit;
