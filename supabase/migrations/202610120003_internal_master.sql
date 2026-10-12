begin;
-- Canonical internal master. Files are immutable provenance; MY edits change these records.
create table private.master_import_batches (
 id uuid primary key, content_hash text not null unique, exported_on date not null,
 source_system text not null, status text not null check(status in ('loading','complete')),
 imported_at timestamptz not null default now(), imported_by uuid references auth.users(id),
 source_file_count integer not null, source_row_count integer not null, detail_row_count integer not null
);
create table private.master_import_files (
 id uuid primary key, batch_id uuid not null references private.master_import_batches(id),
 name text not null, sha256 text not null, original_xlsx bytea not null,
 metadata jsonb not null, unique(batch_id,name)
);
create table private.master_source_rows (
 id uuid primary key, file_id uuid not null references private.master_import_files(id),
 sheet_name text not null, excel_row integer not null, row_kind text not null check(row_kind in ('detail','control')),
 values_json jsonb not null, raw_cells jsonb not null, row_hash text not null,
 unique(file_id,sheet_name,excel_row)
);
create table private.master_field_dictionary (
 id bigint generated always as identity primary key, source_system text not null,
 source_file_type text not null, source_column text not null, source_label text not null,
 target_table text not null, target_field text not null, postgres_type text not null,
 rules jsonb not null, unique(source_system,source_file_type,source_column)
);
create table private.master_access (
 user_id uuid not null references auth.users(id), feature text not null check(feature in ('master.read','master.write','master.history','master.confidential')),
 allowed boolean not null, primary key(user_id,feature)
);
create table private.master_change_history (
 id bigint generated always as identity primary key, table_name text not null, record_id uuid not null,
 operation text not null, previous_revision bigint, next_revision bigint, before_record jsonb, after_record jsonb,
 changed_fields text[] not null, changed_by uuid references auth.users(id), changed_at timestamptz not null default now(),
 change_origin text not null, change_reason text not null, import_batch_id uuid references private.master_import_batches(id)
);
create index master_history_record on private.master_change_history(table_name,record_id,id desc);

create table private.master_vehicles (
 id uuid primary key default gen_random_uuid(),
 source_code text,
 short_name text,
 name text,
 english_name text,
 source_asset_summary text,
 vehicle_kind text,
 offering_type text,
 fund_form text,
 legal_form text,
 fund_category text,
 geographic_scope text,
 investment_region text,
 investment_sector text,
 fund_type text,
 strategy text,
 operation_status text,
 established_on date,
 inception_on date,
 maturity_on date,
 management_ended_on date,
 terminated_on date,
 source_beneficiary_summary text,
 source_lender_summary text,
 source_distributors text,
 source_trustee text,
 source_administrator text,
 risk_grade text,
 investment_department text,
 investment_manager_names text,
 investment_lead_names text,
 operation_division text,
 operation_department text,
 operation_manager_names text,
 operation_lead_names text,
 is_development boolean,
 is_delegated boolean,
 includes_internal_funds boolean,
 included_in_aum boolean,
 kms_target boolean,
 beneficiaries_confidential boolean,
 audited boolean,
 high_complexity boolean,
 master_feeder_type text,
 multi_class_type text,
 subscription_redemption_method text,
 capital_call boolean,
 share_deal boolean,
 share_deal_on date,
 business_registration_raw text,
 administrator_code text,
 administrator_fund_name text,
 fss_code text,
 kofia_code text,
 ksd_fund_code text,
 ksd_security_code text,
 collective_investment_class text,
 fiscal_reference_on date,
 accounting_period_months integer,
 source_row_id uuid,
 source_system text,
 source_exported_on date,
 party_id uuid,
 maturity_raw text,
 maturity_kind text,
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
comment on table private.master_vehicles is '펀드 관리';
create table private.master_investment_objects (
 id uuid primary key default gen_random_uuid(),
 source_code text,
 name text,
 geographic_scope text,
 address_raw text,
 underlying_sector text,
 business_stage text,
 land_area_pyeong numeric(30,6),
 land_area_m2 numeric(30,6),
 footprint_pyeong numeric(30,6),
 footprint_m2 numeric(30,6),
 gross_area_pyeong numeric(30,6),
 gross_area_m2 numeric(30,6),
 rentable_area_pyeong numeric(30,6),
 rentable_area_m2 numeric(30,6),
 exclusive_area_pyeong numeric(30,6),
 exclusive_area_m2 numeric(30,6),
 efficiency_pct numeric(14,6),
 floors_below integer,
 floors_above integer,
 completion_expected_on date,
 remodeled boolean,
 remodeled_on date,
 building_count integer,
 room_count integer,
 parking_count integer,
 investment_region text,
 country_name text,
 city_name text,
 loan_currency text,
 loan_amount numeric(30,6),
 ltv_pct numeric(14,6),
 appraisal_amount numeric(30,6),
 certificate_scheme text,
 certificate_awarded_on date,
 certificate_rating text,
 certificate_expires_on date,
 source_sold_flag boolean,
 acquired_on date,
 acquisition_currency text,
 acquisition_cap_rate_pct numeric(14,6),
 acquisition_price numeric(30,6),
 acquisition_price_per_pyeong numeric(30,6),
 acquisition_noi numeric(30,6),
 acquisition_occupancy_pct numeric(14,6),
 acquisition_vacancy_pct numeric(14,6),
 source_seller text,
 disposed_on date,
 disposal_currency text,
 disposal_cap_rate_pct numeric(14,6),
 disposal_price numeric(30,6),
 disposal_price_per_pyeong numeric(30,6),
 disposal_noi numeric(30,6),
 disposal_occupancy_pct numeric(14,6),
 disposal_vacancy_pct numeric(14,6),
 source_buyer text,
 source_row_id uuid,
 source_system text,
 source_exported_on date,
 asset_id uuid,
 party_id uuid,
 underlying_vehicle_id uuid,
 object_kind text,
 resolution_status text,
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
comment on table private.master_investment_objects is '투자 자산 관리';
create table private.master_investments (
 id uuid primary key default gen_random_uuid(),
 vehicle_source_code text,
 vehicle_short_name text,
 vehicle_name text,
 vehicle_geographic_scope text,
 vehicle_fund_type text,
 source_sequence text,
 object_name text,
 underlying_sector text,
 business_stage text,
 investment_nature text,
 holding_form text,
 vehicle_strategy text,
 vehicle_kind text,
 object_geographic_scope text,
 investment_region text,
 sold boolean,
 address_raw text,
 country_name text,
 gross_area_m2 numeric(30,6),
 gross_area_pyeong numeric(30,6),
 rentable_area_m2 numeric(30,6),
 rentable_area_pyeong numeric(30,6),
 remodeled_on date,
 completion_expected_on date,
 source_local_manager text,
 source_property_manager text,
 fund_of_funds_type text,
 fund_of_funds_sector text,
 fund_of_funds_strategy text,
 vehicle_operation_status text,
 vehicle_inception_on date,
 vehicle_maturity_on date,
 vehicle_terminated_on date,
 vehicle_fund_form text,
 vehicle_master_feeder_type text,
 vehicle_multi_class_type text,
 vehicle_offering_type text,
 vehicle_open_closed text,
 vehicle_includes_internal_funds boolean,
 operation_division text,
 operation_department text,
 operation_manager_names text,
 source_row_id uuid,
 source_system text,
 source_exported_on date,
 vehicle_id uuid,
 object_id uuid,
 resolution_status text,
 ownership_pct numeric(14,6),
 allocated_amount numeric(30,6),
 currency_code text,
 relationship_started_on date,
 relationship_ended_on date,
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
comment on table private.master_investments is '투자 자산 조회';
create table private.master_loan_positions (
 id uuid primary key default gen_random_uuid(),
 as_of date,
 vehicle_source_code text,
 vehicle_short_name text,
 vehicle_name text,
 investment_sector text,
 asset_summary text,
 geographic_scope text,
 vehicle_inception_on date,
 vehicle_maturity_on date,
 lender_name text,
 commitment_amount numeric(30,6),
 drawn_amount numeric(30,6),
 undrawn_amount numeric(30,6),
 drawn_on date,
 maturity_on date,
 tranche text,
 shareholder_loan boolean,
 securitized boolean,
 interest_type text,
 base_rate_pct numeric(14,6),
 spread_pct numeric(14,6),
 interest_rate_pct numeric(14,6),
 all_in_rate_pct numeric(14,6),
 loan_type text,
 note text,
 operation_department text,
 operation_manager_names text,
 source_row_id uuid,
 source_system text,
 source_exported_on date,
 vehicle_id uuid,
 lender_party_id uuid,
 loan_contract_id uuid,
 currency_code text,
 identity_status text,
 amount_basis text,
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
comment on table private.master_loan_positions is '대주 정보 조회';
create table private.master_beneficiary_positions (
 id uuid primary key default gen_random_uuid(),
 as_of date,
 vehicle_source_code text,
 vehicle_short_name text,
 vehicle_name text,
 investment_sector text,
 asset_summary text,
 geographic_scope text,
 vehicle_inception_on date,
 vehicle_maturity_on date,
 beneficiary_name text,
 investor_category text,
 investor_classification text,
 first_commitment_on date,
 commitment_call_on date,
 commitment_amount numeric(30,6),
 funded_amount numeric(30,6),
 unfunded_amount numeric(30,6),
 subscription_redemption_units numeric(30,6),
 subscription_redemption_amount numeric(30,6),
 reported_pct numeric(14,6),
 note text,
 operation_department text,
 operation_manager_names text,
 source_row_id uuid,
 source_system text,
 source_exported_on date,
 vehicle_id uuid,
 investor_party_id uuid,
 currency_code text,
 currency_status text,
 identity_status text,
 confidential boolean,
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
comment on table private.master_beneficiary_positions is '수익자 정보 조회';
create table private.master_aum_snapshots (
 id uuid primary key default gen_random_uuid(),
 vehicle_source_code text,
 vehicle_short_name text,
 vehicle_name text,
 investment_sector text,
 asset_summary text,
 operation_status text,
 vehicle_established_on date,
 vehicle_inception_on date,
 vehicle_maturity_on date,
 administrator_as_of date,
 nav_per_unit numeric(30,6),
 net_asset_value numeric(30,6),
 aum_entered_on date,
 committed_equity numeric(30,6),
 committed_loan numeric(30,6),
 committed_deposit numeric(30,6),
 committed_aum numeric(30,6),
 funded_equity numeric(30,6),
 funded_loan numeric(30,6),
 funded_deposit numeric(30,6),
 funded_aum numeric(30,6),
 source_beneficiary_summary text,
 source_lender_summary text,
 automated boolean,
 operation_department text,
 operation_manager_names text,
 manager_confirmed boolean,
 manager_confirmed_at timestamp,
 operation_lead_names text,
 lead_confirmed boolean,
 lead_confirmed_at timestamp,
 geographic_scope text,
 vehicle_kind text,
 delegated boolean,
 fund_type text,
 strategy text,
 master_feeder_type text,
 multi_class_type text,
 fund_form text,
 offering_type text,
 open_closed text,
 source_row_id uuid,
 source_system text,
 source_exported_on date,
 vehicle_id uuid,
 currency_code text,
 business_as_of date,
 business_as_of_status text,
 aggregation_status text,
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
comment on table private.master_aum_snapshots is '펀드 AUM 관리';
create table private.master_assets (
 id uuid primary key default gen_random_uuid(),
 name text,
 asset_kind text,
 primary_use text,
 country_code text,
 address text,
 latitude numeric(30,6),
 longitude numeric(30,6),
 gross_area_m2 numeric(30,6),
 completion_year integer,
 lifecycle_status text,
 existing_building_id uuid,
 source_row_id uuid,
 visibility text,
 description text,
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
comment on table private.master_assets is '건물·호텔·물류·DC·토지·개발사업의 공통 자산';
create table private.master_parties (
 id uuid primary key default gen_random_uuid(),
 name text,
 party_kind text,
 country_code text,
 identity_status text,
 confidential boolean,
 source_row_id uuid,
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
comment on table private.master_parties is '기업·기관·개인·투자기구의 공통 참여자';
create table private.master_organizations (
 id uuid primary key default gen_random_uuid(),
 party_id uuid,
 existing_company_id uuid,
 legal_name text,
 english_name text,
 industry_code text,
 industry_code_system text,
 industry_name text,
 website text,
 founded_on date,
 closed_on date,
 listed_market text,
 ticker text,
 headquarters_address text,
 overview text,
 source_row_id uuid,
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
comment on table private.master_organizations is '기업 기본정보. 임차사·소유주·투자자·대주가 공유';
create table private.master_identifiers (
 id uuid primary key default gen_random_uuid(),
 asset_id uuid,
 party_id uuid,
 vehicle_id uuid,
 namespace text,
 identifier text,
 country_code text,
 valid_from date,
 valid_to date,
 verified boolean,
 source_row_id uuid,
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
comment on table private.master_identifiers is '코드 발급기관·종류·국가를 포함한 식별자';
create table private.master_aliases (
 id uuid primary key default gen_random_uuid(),
 asset_id uuid,
 party_id uuid,
 vehicle_id uuid,
 alias text,
 alias_kind text,
 valid_from date,
 valid_to date,
 source_row_id uuid,
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
comment on table private.master_aliases is '옛 이름·약칭·영문명. 자동 동일인 판정 금지';
create table private.master_asset_components (
 id uuid primary key default gen_random_uuid(),
 parent_asset_id uuid,
 child_asset_id uuid,
 relationship_kind text,
 area_inclusion_method text,
 valid_from date,
 valid_to date,
 source_row_id uuid,
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
comment on table private.master_asset_components is '단지·동·개별 건물·포트폴리오 포함관계';
create table private.master_asset_units (
 id uuid primary key default gen_random_uuid(),
 asset_id uuid,
 label text,
 floor_label text,
 unit_kind text,
 rentable_area_m2 numeric(30,6),
 exclusive_area_m2 numeric(30,6),
 source_row_id uuid,
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
comment on table private.master_asset_units is '층·호·공간. 전체 건물과 별도 면적 범위';
create table private.master_occupancies (
 id uuid primary key default gen_random_uuid(),
 asset_id uuid,
 tenant_party_id uuid,
 unit_id uuid,
 existing_occupancy_id uuid,
 contract_key text,
 floors_raw text,
 area_m2 numeric(30,6),
 area_basis text,
 started_on date,
 ended_on date,
 as_of date,
 status text,
 source_row_id uuid,
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
comment on table private.master_occupancies is '기업의 입주 및 임대차 이력';
create table private.master_party_relationships (
 id uuid primary key default gen_random_uuid(),
 from_party_id uuid,
 to_party_id uuid,
 relationship_kind text,
 ownership_pct numeric(14,6),
 valid_from date,
 valid_to date,
 source_row_id uuid,
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
comment on table private.master_party_relationships is '기업집단·자회사·주주·합병·상호 변경 관계';
create table private.master_party_roles (
 id uuid primary key default gen_random_uuid(),
 party_id uuid,
 asset_id uuid,
 vehicle_id uuid,
 role_kind text,
 ownership_pct numeric(14,6),
 valid_from date,
 valid_to date,
 verification_status text,
 source_row_id uuid,
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
comment on table private.master_party_roles is '소유·임차 외 운용·PM·수탁·판매 등 역할';
create table private.master_company_financials (
 id uuid primary key default gen_random_uuid(),
 party_id uuid,
 period_start date,
 period_end date,
 fiscal_year integer,
 report_kind text,
 accounting_standard text,
 consolidation_scope text,
 currency_code text,
 unit_multiplier numeric(30,6),
 revenue numeric(30,6),
 operating_profit numeric(30,6),
 net_income numeric(30,6),
 total_assets numeric(30,6),
 total_liabilities numeric(30,6),
 equity numeric(30,6),
 employee_count integer,
 source_row_id uuid,
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
comment on table private.master_company_financials is '기간·통화·단위·연결/별도별 기업 재무';
create table private.master_business_locations (
 id uuid primary key default gen_random_uuid(),
 party_id uuid,
 asset_id uuid,
 location_name text,
 location_kind text,
 address text,
 country_code text,
 started_on date,
 ended_on date,
 source_row_id uuid,
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
comment on table private.master_business_locations is '기업의 본사·지점과 자산 연결';
create table private.master_vehicle_relationships (
 id uuid primary key default gen_random_uuid(),
 parent_vehicle_id uuid,
 child_vehicle_id uuid,
 relationship_kind text,
 ownership_pct numeric(14,6),
 valid_from date,
 valid_to date,
 consolidation_treatment text,
 source_row_id uuid,
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
comment on table private.master_vehicle_relationships is '모자펀드·클래스·재간접 관계';
create table private.master_team_assignments (
 id uuid primary key default gen_random_uuid(),
 vehicle_id uuid,
 asset_id uuid,
 source_member_id uuid,
 role_kind text,
 member_name_raw text,
 department_raw text,
 valid_from date,
 valid_to date,
 source_row_id uuid,
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
comment on table private.master_team_assignments is '역할·조직·기간별 담당자. 이름과 인증ID 구분';
create table private.master_loan_contracts (
 id uuid primary key default gen_random_uuid(),
 vehicle_id uuid,
 borrower_party_id uuid,
 external_contract_id text,
 name text,
 currency_code text,
 signed_on date,
 maturity_on date,
 commitment_amount numeric(30,6),
 source_row_id uuid,
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
comment on table private.master_loan_contracts is '계약 식별이 확인된 대출. 대주 스냅샷과 분리';
create table private.master_asset_links (
 id uuid primary key default gen_random_uuid(),
 object_id uuid,
 asset_id uuid,
 existing_building_id uuid,
 existing_complex_id uuid,
 existing_tower_id uuid,
 status text,
 evidence jsonb,
 reviewed_by uuid,
 reviewed_at timestamptz,
 source_row_id uuid,
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
comment on table private.master_asset_links is '기존 서비스와 원본 자산의 검토·승인 연결';
create table private.master_review_issues (
 id uuid primary key default gen_random_uuid(),
 issue_kind text,
 severity text,
 source_row_id uuid,
 related_source_row_ids jsonb,
 entity_table text,
 entity_id uuid,
 details jsonb,
 status text,
 resolution_note text,
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
comment on table private.master_review_issues is '중복·불일치·누락·명칭 연결 검토';
alter table private.master_vehicles add foreign key (source_row_id) references private.master_source_rows(id);
create index on private.master_vehicles (source_row_id);
alter table private.master_vehicles add foreign key (party_id) references private.master_parties(id);
create index on private.master_vehicles (party_id);
create unique index on private.master_vehicles(source_row_id) where source_row_id is not null;
alter table private.master_investment_objects add foreign key (source_row_id) references private.master_source_rows(id);
create index on private.master_investment_objects (source_row_id);
alter table private.master_investment_objects add foreign key (asset_id) references private.master_assets(id);
create index on private.master_investment_objects (asset_id);
alter table private.master_investment_objects add foreign key (party_id) references private.master_parties(id);
create index on private.master_investment_objects (party_id);
alter table private.master_investment_objects add foreign key (underlying_vehicle_id) references private.master_vehicles(id);
create index on private.master_investment_objects (underlying_vehicle_id);
create unique index on private.master_investment_objects(source_row_id) where source_row_id is not null;
alter table private.master_investments add foreign key (source_row_id) references private.master_source_rows(id);
create index on private.master_investments (source_row_id);
alter table private.master_investments add foreign key (vehicle_id) references private.master_vehicles(id);
create index on private.master_investments (vehicle_id);
alter table private.master_investments add foreign key (object_id) references private.master_investment_objects(id);
create index on private.master_investments (object_id);
create unique index on private.master_investments(source_row_id) where source_row_id is not null;
alter table private.master_loan_positions add foreign key (source_row_id) references private.master_source_rows(id);
create index on private.master_loan_positions (source_row_id);
alter table private.master_loan_positions add foreign key (vehicle_id) references private.master_vehicles(id);
create index on private.master_loan_positions (vehicle_id);
alter table private.master_loan_positions add foreign key (lender_party_id) references private.master_parties(id);
create index on private.master_loan_positions (lender_party_id);
alter table private.master_loan_positions add foreign key (loan_contract_id) references private.master_loan_contracts(id);
create index on private.master_loan_positions (loan_contract_id);
create unique index on private.master_loan_positions(source_row_id) where source_row_id is not null;
alter table private.master_beneficiary_positions add foreign key (source_row_id) references private.master_source_rows(id);
create index on private.master_beneficiary_positions (source_row_id);
alter table private.master_beneficiary_positions add foreign key (vehicle_id) references private.master_vehicles(id);
create index on private.master_beneficiary_positions (vehicle_id);
alter table private.master_beneficiary_positions add foreign key (investor_party_id) references private.master_parties(id);
create index on private.master_beneficiary_positions (investor_party_id);
create unique index on private.master_beneficiary_positions(source_row_id) where source_row_id is not null;
alter table private.master_aum_snapshots add foreign key (source_row_id) references private.master_source_rows(id);
create index on private.master_aum_snapshots (source_row_id);
alter table private.master_aum_snapshots add foreign key (vehicle_id) references private.master_vehicles(id);
create index on private.master_aum_snapshots (vehicle_id);
create unique index on private.master_aum_snapshots(source_row_id) where source_row_id is not null;
alter table private.master_assets add foreign key (existing_building_id) references public.buildings(id);
create index on private.master_assets (existing_building_id);
alter table private.master_assets add foreign key (source_row_id) references private.master_source_rows(id);
create index on private.master_assets (source_row_id);
alter table private.master_parties add foreign key (source_row_id) references private.master_source_rows(id);
create index on private.master_parties (source_row_id);
alter table private.master_organizations add foreign key (party_id) references private.master_parties(id);
create index on private.master_organizations (party_id);
alter table private.master_organizations add foreign key (existing_company_id) references public.companies(id);
create index on private.master_organizations (existing_company_id);
alter table private.master_organizations add foreign key (source_row_id) references private.master_source_rows(id);
create index on private.master_organizations (source_row_id);
alter table private.master_identifiers add foreign key (asset_id) references private.master_assets(id);
create index on private.master_identifiers (asset_id);
alter table private.master_identifiers add foreign key (party_id) references private.master_parties(id);
create index on private.master_identifiers (party_id);
alter table private.master_identifiers add foreign key (vehicle_id) references private.master_vehicles(id);
create index on private.master_identifiers (vehicle_id);
alter table private.master_identifiers add foreign key (source_row_id) references private.master_source_rows(id);
create index on private.master_identifiers (source_row_id);
alter table private.master_aliases add foreign key (asset_id) references private.master_assets(id);
create index on private.master_aliases (asset_id);
alter table private.master_aliases add foreign key (party_id) references private.master_parties(id);
create index on private.master_aliases (party_id);
alter table private.master_aliases add foreign key (vehicle_id) references private.master_vehicles(id);
create index on private.master_aliases (vehicle_id);
alter table private.master_aliases add foreign key (source_row_id) references private.master_source_rows(id);
create index on private.master_aliases (source_row_id);
alter table private.master_asset_components add foreign key (parent_asset_id) references private.master_assets(id);
create index on private.master_asset_components (parent_asset_id);
alter table private.master_asset_components add foreign key (child_asset_id) references private.master_assets(id);
create index on private.master_asset_components (child_asset_id);
alter table private.master_asset_components add foreign key (source_row_id) references private.master_source_rows(id);
create index on private.master_asset_components (source_row_id);
alter table private.master_asset_units add foreign key (asset_id) references private.master_assets(id);
create index on private.master_asset_units (asset_id);
alter table private.master_asset_units add foreign key (source_row_id) references private.master_source_rows(id);
create index on private.master_asset_units (source_row_id);
alter table private.master_occupancies add foreign key (asset_id) references private.master_assets(id);
create index on private.master_occupancies (asset_id);
alter table private.master_occupancies add foreign key (tenant_party_id) references private.master_parties(id);
create index on private.master_occupancies (tenant_party_id);
alter table private.master_occupancies add foreign key (unit_id) references private.master_asset_units(id);
create index on private.master_occupancies (unit_id);
alter table private.master_occupancies add foreign key (existing_occupancy_id) references public.occupancies(id);
create index on private.master_occupancies (existing_occupancy_id);
alter table private.master_occupancies add foreign key (source_row_id) references private.master_source_rows(id);
create index on private.master_occupancies (source_row_id);
alter table private.master_party_relationships add foreign key (from_party_id) references private.master_parties(id);
create index on private.master_party_relationships (from_party_id);
alter table private.master_party_relationships add foreign key (to_party_id) references private.master_parties(id);
create index on private.master_party_relationships (to_party_id);
alter table private.master_party_relationships add foreign key (source_row_id) references private.master_source_rows(id);
create index on private.master_party_relationships (source_row_id);
alter table private.master_party_roles add foreign key (party_id) references private.master_parties(id);
create index on private.master_party_roles (party_id);
alter table private.master_party_roles add foreign key (asset_id) references private.master_assets(id);
create index on private.master_party_roles (asset_id);
alter table private.master_party_roles add foreign key (vehicle_id) references private.master_vehicles(id);
create index on private.master_party_roles (vehicle_id);
alter table private.master_party_roles add foreign key (source_row_id) references private.master_source_rows(id);
create index on private.master_party_roles (source_row_id);
alter table private.master_company_financials add foreign key (party_id) references private.master_parties(id);
create index on private.master_company_financials (party_id);
alter table private.master_company_financials add foreign key (source_row_id) references private.master_source_rows(id);
create index on private.master_company_financials (source_row_id);
alter table private.master_business_locations add foreign key (party_id) references private.master_parties(id);
create index on private.master_business_locations (party_id);
alter table private.master_business_locations add foreign key (asset_id) references private.master_assets(id);
create index on private.master_business_locations (asset_id);
alter table private.master_business_locations add foreign key (source_row_id) references private.master_source_rows(id);
create index on private.master_business_locations (source_row_id);
alter table private.master_vehicle_relationships add foreign key (parent_vehicle_id) references private.master_vehicles(id);
create index on private.master_vehicle_relationships (parent_vehicle_id);
alter table private.master_vehicle_relationships add foreign key (child_vehicle_id) references private.master_vehicles(id);
create index on private.master_vehicle_relationships (child_vehicle_id);
alter table private.master_vehicle_relationships add foreign key (source_row_id) references private.master_source_rows(id);
create index on private.master_vehicle_relationships (source_row_id);
alter table private.master_team_assignments add foreign key (vehicle_id) references private.master_vehicles(id);
create index on private.master_team_assignments (vehicle_id);
alter table private.master_team_assignments add foreign key (asset_id) references private.master_assets(id);
create index on private.master_team_assignments (asset_id);
alter table private.master_team_assignments add foreign key (source_row_id) references private.master_source_rows(id);
create index on private.master_team_assignments (source_row_id);
alter table private.master_loan_contracts add foreign key (vehicle_id) references private.master_vehicles(id);
create index on private.master_loan_contracts (vehicle_id);
alter table private.master_loan_contracts add foreign key (borrower_party_id) references private.master_parties(id);
create index on private.master_loan_contracts (borrower_party_id);
alter table private.master_loan_contracts add foreign key (source_row_id) references private.master_source_rows(id);
create index on private.master_loan_contracts (source_row_id);
alter table private.master_asset_links add foreign key (object_id) references private.master_investment_objects(id);
create index on private.master_asset_links (object_id);
alter table private.master_asset_links add foreign key (asset_id) references private.master_assets(id);
create index on private.master_asset_links (asset_id);
alter table private.master_asset_links add foreign key (existing_building_id) references public.buildings(id);
create index on private.master_asset_links (existing_building_id);
alter table private.master_asset_links add foreign key (existing_complex_id) references public.building_complexes(id);
create index on private.master_asset_links (existing_complex_id);
alter table private.master_asset_links add foreign key (existing_tower_id) references public.building_towers(id);
create index on private.master_asset_links (existing_tower_id);
alter table private.master_asset_links add foreign key (reviewed_by) references auth.users(id);
create index on private.master_asset_links (reviewed_by);
alter table private.master_asset_links add foreign key (source_row_id) references private.master_source_rows(id);
create index on private.master_asset_links (source_row_id);
alter table private.master_review_issues add foreign key (source_row_id) references private.master_source_rows(id);
create index on private.master_review_issues (source_row_id);
create unique index on private.master_vehicles(source_system,source_code) where source_code is not null;
create unique index on private.master_investment_objects(source_system,source_code) where source_code is not null;

create unique index on private.master_assets(existing_building_id) where existing_building_id is not null;
create unique index on private.master_organizations(party_id) where party_id is not null;
create unique index on private.master_organizations(existing_company_id) where existing_company_id is not null;
alter table private.master_assets add check (length(trim(name))>0);
alter table private.master_parties add check (length(trim(name))>0);
alter table private.master_vehicles add check (length(trim(name))>0);
alter table private.master_assets alter column name set not null;
alter table private.master_parties alter column name set not null;
alter table private.master_vehicles alter column name set not null;
alter table private.master_identifiers add check(num_nonnulls(asset_id,party_id,vehicle_id)=1);
alter table private.master_aliases add check(num_nonnulls(asset_id,party_id,vehicle_id)=1);
alter table private.master_asset_components add check(parent_asset_id<>child_asset_id);
alter table private.master_party_relationships add check(from_party_id<>to_party_id);
alter table private.master_vehicle_relationships add check(parent_vehicle_id<>child_vehicle_id);
alter table private.master_company_financials add check(period_end>=period_start);
alter table private.master_occupancies add check(ended_on is null or started_on is null or ended_on>=started_on);
-- Names are deliberately not unique; undisclosed investors and branch names must not be merged.
-- AUM and financing balances are observations, not sums allocated to every underlying asset.
create function private.master_track_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare b jsonb; a jsonb; changed text[]; origin text; reason text;
begin
 if tg_op='UPDATE' then
  new.revision=old.revision+1; new.updated_at=now(); new.updated_by=auth.uid();
 elsif tg_op='INSERT' then
  new.revision=1; new.updated_at=now(); new.updated_by=auth.uid();
 end if;
 b=case when tg_op='INSERT' then null else to_jsonb(old) end;
 a=case when tg_op='DELETE' then null else to_jsonb(new) end;
 select array_agg(k order by k) into changed from
  (select jsonb_object_keys(coalesce(a,b)) k) keys
  where k not in ('revision','created_at','updated_at','updated_by') and (b->k) is distinct from (a->k);
 origin=coalesce(nullif(current_setting('app.master_origin',true),''),'database');
 reason=coalesce(nullif(current_setting('app.master_reason',true),''),'database change');
 insert into private.master_change_history(table_name,record_id,operation,previous_revision,next_revision,before_record,after_record,changed_fields,changed_by,change_origin,change_reason,import_batch_id)
 values(tg_table_name,coalesce(new.id,old.id),tg_op,(b->>'revision')::bigint,(a->>'revision')::bigint,b,a,coalesce(changed,'{}'),auth.uid(),origin,reason,nullif(current_setting('app.master_batch',true),'')::uuid);
 if tg_op='DELETE' then return old; end if; return new;
end $$;
revoke all on function private.master_track_change() from public,anon,authenticated;
create function private.master_no_rewrite() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'immutable_source_or_history'; end $$;
revoke all on function private.master_no_rewrite() from public,anon,authenticated;

create trigger master_track_change before insert or update or delete on private.master_vehicles for each row execute function private.master_track_change();
create trigger master_track_change before insert or update or delete on private.master_investment_objects for each row execute function private.master_track_change();
create trigger master_track_change before insert or update or delete on private.master_investments for each row execute function private.master_track_change();
create trigger master_track_change before insert or update or delete on private.master_loan_positions for each row execute function private.master_track_change();
create trigger master_track_change before insert or update or delete on private.master_beneficiary_positions for each row execute function private.master_track_change();
create trigger master_track_change before insert or update or delete on private.master_aum_snapshots for each row execute function private.master_track_change();
create trigger master_track_change before insert or update or delete on private.master_assets for each row execute function private.master_track_change();
create trigger master_track_change before insert or update or delete on private.master_parties for each row execute function private.master_track_change();
create trigger master_track_change before insert or update or delete on private.master_organizations for each row execute function private.master_track_change();
create trigger master_track_change before insert or update or delete on private.master_identifiers for each row execute function private.master_track_change();
create trigger master_track_change before insert or update or delete on private.master_aliases for each row execute function private.master_track_change();
create trigger master_track_change before insert or update or delete on private.master_asset_components for each row execute function private.master_track_change();
create trigger master_track_change before insert or update or delete on private.master_asset_units for each row execute function private.master_track_change();
create trigger master_track_change before insert or update or delete on private.master_occupancies for each row execute function private.master_track_change();
create trigger master_track_change before insert or update or delete on private.master_party_relationships for each row execute function private.master_track_change();
create trigger master_track_change before insert or update or delete on private.master_party_roles for each row execute function private.master_track_change();
create trigger master_track_change before insert or update or delete on private.master_company_financials for each row execute function private.master_track_change();
create trigger master_track_change before insert or update or delete on private.master_business_locations for each row execute function private.master_track_change();
create trigger master_track_change before insert or update or delete on private.master_vehicle_relationships for each row execute function private.master_track_change();
create trigger master_track_change before insert or update or delete on private.master_team_assignments for each row execute function private.master_track_change();
create trigger master_track_change before insert or update or delete on private.master_loan_contracts for each row execute function private.master_track_change();
create trigger master_track_change before insert or update or delete on private.master_asset_links for each row execute function private.master_track_change();
create trigger master_track_change before insert or update or delete on private.master_review_issues for each row execute function private.master_track_change();
create trigger master_no_rewrite before update or delete on private.master_import_files for each row execute function private.master_no_rewrite();
create trigger master_no_rewrite before update or delete on private.master_source_rows for each row execute function private.master_no_rewrite();
create trigger master_no_rewrite before update or delete on private.master_change_history for each row execute function private.master_no_rewrite();

create function public.has_master_permission(feature text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select m.enabled and m.verified_until>now() and public.has_workplace_permission('details.read')
  and coalesce((select a.allowed from private.master_access a where a.user_id=m.user_id and a.feature=$1),
     case when $1='master.read' then true when $1 in ('master.write','master.history','master.confidential') then m.role='admin' else false end)
 from private.workplace_members m where m.user_id=auth.uid()),false)
$$;
revoke all on function public.has_master_permission(text) from public,anon;
grant execute on function public.has_master_permission(text) to authenticated;


create function private.master_table_allowed(t text) returns boolean language sql immutable set search_path='' as $$
 select t in ('master_vehicles', 'master_investment_objects', 'master_investments', 'master_loan_positions', 'master_beneficiary_positions', 'master_aum_snapshots', 'master_assets', 'master_parties', 'master_organizations', 'master_identifiers', 'master_aliases', 'master_asset_components', 'master_asset_units', 'master_occupancies', 'master_party_relationships', 'master_party_roles', 'master_company_financials', 'master_business_locations', 'master_vehicle_relationships', 'master_team_assignments', 'master_loan_contracts', 'master_asset_links')
$$;
revoke all on function private.master_table_allowed(text) from public,anon,authenticated;
create function private.master_json(t jsonb, entity_type text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c text; result jsonb=t; label text;
begin
 for c in select column_name from information_schema.columns where table_schema='private' and table_name=entity_type and data_type='numeric' loop
  if t->c is not null and t->c<>'null'::jsonb then result=jsonb_set(result,array[c],to_jsonb(t->>c)); end if;
 end loop;
 if not public.has_master_permission('master.confidential') then result=result-'source_beneficiary_summary'; end if;
 if t->>'vehicle_id' is not null then
  select name into label from private.master_vehicles where id=(t->>'vehicle_id')::uuid;
  result=result||jsonb_build_object('vehicle_label',label);
 end if;
 if entity_type in ('master_loan_positions','master_beneficiary_positions') then
  select name into label from private.master_parties where id=coalesce(t->>'lender_party_id',t->>'investor_party_id')::uuid;
  result=result||jsonb_build_object('party_label',label);
 end if;
 return result;
end $$;
revoke all on function private.master_json(jsonb,text) from public,anon,authenticated;
-- Internal canonical changes are deliberately not propagated into anonymous catalog views.
create function public.master_save_record(entity_type text, record_id uuid, expected_revision bigint, changes jsonb, change_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_record jsonb; result jsonb; col text; cols text[]='{}'; sets text[]='{}'; record_key uuid=coalesce(record_id,gen_random_uuid());
begin
 if not public.has_master_permission('master.write') or not public.has_master_permission('master.confidential') then raise exception 'master_write_denied'; end if;
 if not private.master_table_allowed(entity_type) then raise exception 'invalid_entity_type'; end if;
 if jsonb_typeof(changes)<>'object' or changes='{}'::jsonb or length(trim(change_reason))<3 or change_reason is null then raise exception 'invalid_change'; end if;
 if pg_column_size(changes)>65536 then raise exception 'change_too_large'; end if;
 for col in select jsonb_object_keys(changes) loop
  if col in ('id','revision','created_at','updated_at','updated_by','source_row_id','source_code','source_system','source_exported_on','existing_building_id','existing_company_id','existing_occupancy_id','reviewed_by','reviewed_at','visibility') then raise exception 'immutable_or_review_only_field'; end if;
  if not exists(select 1 from information_schema.columns where table_schema='private' and table_name=entity_type and column_name=col) then raise exception 'invalid_field'; end if;
  cols=array_append(cols,format('%I',col)); sets=array_append(sets,format('%I=p.%I',col,col));
 end loop;
 perform set_config('app.master_origin','my',true); perform set_config('app.master_reason',change_reason,true); perform set_config('app.master_batch','',true);
 if record_id is null then
  if expected_revision is not null then raise exception 'new_record_revision_must_be_null'; end if;
  execute format('insert into private.%I (id,%s) select $2,%s from jsonb_populate_record(null::private.%I,$1) p returning to_jsonb(%I.*)',entity_type,array_to_string(cols,','),array_to_string(cols,','),entity_type,entity_type) into result using changes,record_key;
 else
  execute format('select to_jsonb(t) from private.%I t where id=$1 for update',entity_type) into current_record using record_id;
  if current_record is null then raise exception 'record_not_found'; end if;
  if expected_revision is null or (current_record->>'revision')::bigint<>expected_revision then raise exception 'revision_conflict'; end if;
  execute format('update private.%I t set %s from jsonb_populate_record(null::private.%I,$1) p where t.id=$2 returning to_jsonb(t)',entity_type,array_to_string(sets,','),entity_type) into result using changes,record_id;
 end if;
 return private.master_json(result,entity_type);
end $$;
revoke all on function public.master_save_record(text,uuid,bigint,jsonb,text) from public,anon;
grant execute on function public.master_save_record(text,uuid,bigint,jsonb,text) to authenticated;

create function public.master_list_records(entity_type text, search_text text default '', page_limit integer default 30, page_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare payload jsonb; predicate text='true';
begin
 if not public.has_master_permission('master.read') then raise exception 'master_read_denied'; end if;
 if not private.master_table_allowed(entity_type) then raise exception 'invalid_entity_type'; end if;
 if page_limit not between 1 and 100 or page_offset not between 0 and 100000 or length(search_text)>200 then raise exception 'invalid_page'; end if;
 if not public.has_master_permission('master.confidential') then
  if entity_type='master_beneficiary_positions' then predicate='not coalesce(t.confidential,true)';
  elsif entity_type='master_parties' then predicate='not coalesce(t.confidential,true)';
  end if;
  if exists(select 1 from information_schema.columns where table_schema='private' and table_name=entity_type and column_name='party_id') then
   predicate=predicate||' and (t.party_id is null or exists(select 1 from private.master_parties p where p.id=t.party_id and not coalesce(p.confidential,true)))';
  end if;
 end if;
 execute format('select coalesce(jsonb_agg(r.record),''[]''::jsonb) from (select private.master_json(to_jsonb(t),$4) record from private.%I t where %s and ($1='''' or private.master_json(to_jsonb(t),$4)::text ilike ''%%''||$1||''%%'') order by t.created_at,t.id limit $2 offset $3) r',entity_type,predicate)
 into payload using search_text,page_limit,page_offset,entity_type;
 return jsonb_build_object('records',payload,'limit',page_limit,'offset',page_offset);
end $$;
revoke all on function public.master_list_records(text,text,integer,integer) from public,anon;
grant execute on function public.master_list_records(text,text,integer,integer) to authenticated;
create function public.master_record_history(entity_type text, record_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_master_permission('master.history') or not public.has_master_permission('master.confidential') then raise exception 'master_history_denied'; end if;
 if not private.master_table_allowed(entity_type) then raise exception 'invalid_entity_type'; end if;
 return (select coalesce(jsonb_agg(x),'[]'::jsonb) from
  (select id,operation,previous_revision,next_revision,private.master_json(before_record,entity_type) before_record,private.master_json(after_record,entity_type) after_record,changed_fields,changed_by,changed_at,change_origin,change_reason
  from private.master_change_history where table_name=entity_type and master_change_history.record_id=$2 order by id desc limit 100) x);
end $$;
revoke all on function public.master_record_history(text,uuid) from public,anon;
grant execute on function public.master_record_history(text,uuid) to authenticated;

create function public.master_asset_context(building_key uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare asset jsonb; objects jsonb; funds jsonb; vehicle_ids uuid[];
begin
 if not public.has_master_permission('master.read') then raise exception 'master_read_denied'; end if;
 select private.master_json(to_jsonb(a),'master_assets') into asset from private.master_assets a where existing_building_id=building_key;
 select coalesce(jsonb_agg(private.master_json(to_jsonb(o),'master_investment_objects')),'[]'::jsonb) into objects
 from private.master_investment_objects o where o.asset_id=(asset->>'id')::uuid and o.resolution_status='verified_source_evidence';
 select array_agg(distinct i.vehicle_id) into vehicle_ids from private.master_investments i
 join private.master_investment_objects o on o.id=i.object_id where o.asset_id=(asset->>'id')::uuid and o.resolution_status='verified_source_evidence';
 select coalesce(jsonb_agg(private.master_json(to_jsonb(f),'master_vehicles')),'[]'::jsonb) into funds from private.master_vehicles f where id=any(vehicle_ids);
 return jsonb_build_object('asset',asset,'objects',objects,'vehicles',funds);
end $$;
revoke all on function public.master_asset_context(uuid) from public,anon;
grant execute on function public.master_asset_context(uuid) to authenticated;

alter table private.master_vehicles enable row level security;
revoke all on private.master_vehicles from public,anon,authenticated;
alter table private.master_investment_objects enable row level security;
revoke all on private.master_investment_objects from public,anon,authenticated;
alter table private.master_investments enable row level security;
revoke all on private.master_investments from public,anon,authenticated;
alter table private.master_loan_positions enable row level security;
revoke all on private.master_loan_positions from public,anon,authenticated;
alter table private.master_beneficiary_positions enable row level security;
revoke all on private.master_beneficiary_positions from public,anon,authenticated;
alter table private.master_aum_snapshots enable row level security;
revoke all on private.master_aum_snapshots from public,anon,authenticated;
alter table private.master_assets enable row level security;
revoke all on private.master_assets from public,anon,authenticated;
alter table private.master_parties enable row level security;
revoke all on private.master_parties from public,anon,authenticated;
alter table private.master_organizations enable row level security;
revoke all on private.master_organizations from public,anon,authenticated;
alter table private.master_identifiers enable row level security;
revoke all on private.master_identifiers from public,anon,authenticated;
alter table private.master_aliases enable row level security;
revoke all on private.master_aliases from public,anon,authenticated;
alter table private.master_asset_components enable row level security;
revoke all on private.master_asset_components from public,anon,authenticated;
alter table private.master_asset_units enable row level security;
revoke all on private.master_asset_units from public,anon,authenticated;
alter table private.master_occupancies enable row level security;
revoke all on private.master_occupancies from public,anon,authenticated;
alter table private.master_party_relationships enable row level security;
revoke all on private.master_party_relationships from public,anon,authenticated;
alter table private.master_party_roles enable row level security;
revoke all on private.master_party_roles from public,anon,authenticated;
alter table private.master_company_financials enable row level security;
revoke all on private.master_company_financials from public,anon,authenticated;
alter table private.master_business_locations enable row level security;
revoke all on private.master_business_locations from public,anon,authenticated;
alter table private.master_vehicle_relationships enable row level security;
revoke all on private.master_vehicle_relationships from public,anon,authenticated;
alter table private.master_team_assignments enable row level security;
revoke all on private.master_team_assignments from public,anon,authenticated;
alter table private.master_loan_contracts enable row level security;
revoke all on private.master_loan_contracts from public,anon,authenticated;
alter table private.master_asset_links enable row level security;
revoke all on private.master_asset_links from public,anon,authenticated;
alter table private.master_review_issues enable row level security;
revoke all on private.master_review_issues from public,anon,authenticated;
alter table private.master_import_batches enable row level security;
revoke all on private.master_import_batches from public,anon,authenticated;
alter table private.master_import_files enable row level security;
revoke all on private.master_import_files from public,anon,authenticated;
alter table private.master_source_rows enable row level security;
revoke all on private.master_source_rows from public,anon,authenticated;
alter table private.master_field_dictionary enable row level security;
revoke all on private.master_field_dictionary from public,anon,authenticated;
alter table private.master_access enable row level security;
revoke all on private.master_access from public,anon,authenticated;
alter table private.master_change_history enable row level security;
revoke all on private.master_change_history from public,anon,authenticated;
revoke all on schema private from public,anon,authenticated;
commit;
