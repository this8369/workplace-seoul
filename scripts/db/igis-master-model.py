"""Versioned field map and master schema. No confidential values in this file."""
import importlib.util, json, os, re
from pathlib import Path

ROOT=Path('data/private/igis-master-20261006')
TABLES={}
MAP={}
def table(name,description,cols,extra=None):
    TABLES[name]={'description':description,'columns':dict(cols),'constraints':extra or []}
def fields(source,table_name,specs):
    MAP[source]=[]
    for spec in specs.split('|'):
        name,typ=spec.strip().split(':',1)
        MAP[source].append({'table':table_name,'field':name,'type':typ})
T='text'; N='numeric(30,6)'; P='numeric(14,6)'; I='integer'; D='date'; B='boolean'; U='uuid'; J='jsonb'
types={'t':T,'n':N,'p':P,'i':I,'d':D,'b':B,'u':U,'j':J,'ts':'timestamp','x':T}

fields('펀드 관리','master_vehicles','''source_code:t|short_name:t|name:t|english_name:t|source_asset_summary:t|vehicle_kind:t|offering_type:t|fund_form:t|legal_form:t|fund_category:t|geographic_scope:t|investment_region:t|investment_sector:t|fund_type:t|strategy:t|operation_status:t|established_on:d|inception_on:d|maturity_on:d|management_ended_on:d|terminated_on:d|source_beneficiary_summary:t|source_lender_summary:t|source_distributors:t|source_trustee:t|source_administrator:t|risk_grade:t|investment_department:t|investment_manager_names:t|investment_lead_names:t|operation_division:t|operation_department:t|operation_manager_names:t|operation_lead_names:t|staff_ui_marker:x|is_development:b|is_delegated:b|includes_internal_funds:b|included_in_aum:b|kms_target:b|beneficiaries_confidential:b|audited:b|high_complexity:b|master_feeder_type:t|multi_class_type:t|subscription_redemption_method:t|capital_call:b|share_deal:b|share_deal_on:d|business_registration_raw:t|administrator_code:t|administrator_fund_name:t|fss_code:t|kofia_code:t|ksd_fund_code:t|ksd_security_code:t|collective_investment_class:t|fiscal_reference_on:d|accounting_period_months:i''')
fields('투자 자산 관리','master_investment_objects','''selection_ui_marker:x|source_code:t|name:t|geographic_scope:t|address_raw:t|underlying_sector:t|business_stage:t|land_area_pyeong:n|land_area_m2:n|footprint_pyeong:n|footprint_m2:n|gross_area_pyeong:n|gross_area_m2:n|rentable_area_pyeong:n|rentable_area_m2:n|exclusive_area_pyeong:n|exclusive_area_m2:n|efficiency_pct:p|floors_below:i|floors_above:i|completion_expected_on:d|remodeled:b|remodeled_on:d|building_count:i|room_count:i|parking_count:i|investment_region:t|country_name:t|city_name:t|loan_currency:t|loan_amount:n|ltv_pct:p|appraisal_amount:n|certificate_scheme:t|certificate_awarded_on:d|certificate_rating:t|certificate_expires_on:d|source_sold_flag:b|acquired_on:d|acquisition_currency:t|acquisition_cap_rate_pct:p|acquisition_price:n|acquisition_price_per_pyeong:n|acquisition_noi:n|acquisition_occupancy_pct:p|acquisition_vacancy_pct:p|source_seller:t|disposed_on:d|disposal_currency:t|disposal_cap_rate_pct:p|disposal_price:n|disposal_price_per_pyeong:n|disposal_noi:n|disposal_occupancy_pct:p|disposal_vacancy_pct:p|source_buyer:t''')
fields('투자 자산 조회','master_investments','''vehicle_source_code:t|vehicle_short_name:t|vehicle_name:t|vehicle_geographic_scope:t|vehicle_fund_type:t|source_sequence:t|object_name:t|underlying_sector:t|business_stage:t|investment_nature:t|holding_form:t|vehicle_strategy:t|vehicle_kind:t|object_geographic_scope:t|investment_region:t|sold:b|address_raw:t|country_name:t|gross_area_m2:n|gross_area_pyeong:n|rentable_area_m2:n|rentable_area_pyeong:n|remodeled_on:d|completion_expected_on:d|source_local_manager:t|source_property_manager:t|fund_of_funds_type:t|fund_of_funds_sector:t|fund_of_funds_strategy:t|vehicle_operation_status:t|vehicle_inception_on:d|vehicle_maturity_on:d|vehicle_terminated_on:d|vehicle_fund_form:t|vehicle_master_feeder_type:t|vehicle_multi_class_type:t|vehicle_offering_type:t|vehicle_open_closed:t|vehicle_includes_internal_funds:b|operation_division:t|operation_department:t|operation_manager_names:t''')
fields('대주 정보 조회','master_loan_positions','''as_of:d|vehicle_source_code:t|vehicle_short_name:t|vehicle_name:t|investment_sector:t|asset_summary:t|geographic_scope:t|vehicle_inception_on:d|vehicle_maturity_on:d|lender_name:t|commitment_amount:n|drawn_amount:n|undrawn_amount:n|drawn_on:d|maturity_on:d|tranche:t|shareholder_loan:b|securitized:b|interest_type:t|base_rate_pct:p|spread_pct:p|interest_rate_pct:p|all_in_rate_pct:p|loan_type:t|note:t|operation_department:t|operation_manager_names:t''')
fields('수익자 정보 조회','master_beneficiary_positions','''as_of:d|vehicle_source_code:t|vehicle_short_name:t|vehicle_name:t|investment_sector:t|asset_summary:t|geographic_scope:t|vehicle_inception_on:d|vehicle_maturity_on:d|beneficiary_name:t|investor_category:t|investor_classification:t|first_commitment_on:d|commitment_call_on:d|commitment_amount:n|funded_amount:n|unfunded_amount:n|subscription_redemption_units:n|subscription_redemption_amount:n|reported_pct:p|note:t|operation_department:t|operation_manager_names:t''')
fields('펀드 AUM 관리','master_aum_snapshots','''vehicle_source_code:t|vehicle_short_name:t|vehicle_name:t|investment_sector:t|asset_summary:t|operation_status:t|vehicle_established_on:d|vehicle_inception_on:d|vehicle_maturity_on:d|administrator_as_of:d|nav_per_unit:n|net_asset_value:n|aum_entered_on:d|committed_equity:n|committed_loan:n|committed_deposit:n|committed_aum:n|funded_equity:n|funded_loan:n|funded_deposit:n|funded_aum:n|source_beneficiary_summary:t|source_lender_summary:t|automated:b|operation_department:t|operation_manager_names:t|manager_confirmed:b|manager_confirmed_at:ts|operation_lead_names:t|lead_confirmed:b|lead_confirmed_at:ts|geographic_scope:t|vehicle_kind:t|delegated:b|fund_type:t|strategy:t|master_feeder_type:t|multi_class_type:t|fund_form:t|offering_type:t|open_closed:t''')
for source,mapping in MAP.items():
    cols=[(m['field'],types[m['type']]) for m in mapping if m['type']!='x']
    table(mapping[0]['table'],source,cols)

# The identity of the source object is distinct from a physical property.
# Shared file fields are observations at each report's grain, not a second authority.
common_source=[('source_row_id',U),('source_system',T),('source_exported_on',D)]
for name in list(TABLES):TABLES[name]['columns'].update(common_source)
TABLES['master_vehicles']['columns'].update(party_id=U,maturity_raw=T,maturity_kind=T)
TABLES['master_investment_objects']['columns'].update(asset_id=U,party_id=U,underlying_vehicle_id=U,object_kind=T,resolution_status=T)
TABLES['master_investments']['columns'].update(vehicle_id=U,object_id=U,resolution_status=T,ownership_pct=P,allocated_amount=N,currency_code=T,relationship_started_on=D,relationship_ended_on=D)
TABLES['master_loan_positions']['columns'].update(vehicle_id=U,lender_party_id=U,loan_contract_id=U,currency_code=T,identity_status=T,amount_basis=T)
TABLES['master_beneficiary_positions']['columns'].update(vehicle_id=U,investor_party_id=U,currency_code=T,currency_status=T,identity_status=T,confidential=B)
TABLES['master_aum_snapshots']['columns'].update(vehicle_id=U,currency_code=T,business_as_of=D,business_as_of_status=T,aggregation_status=T,entered_on_interpretation=T)
table('master_assets','건물·호텔·물류·DC·토지·개발사업의 공통 자산',[('name',T),('asset_kind',T),('primary_use',T),('country_code',T),('address',T),('latitude',N),('longitude',N),('gross_area_m2',N),('completion_year',I),('lifecycle_status',T),('existing_building_id',U),('source_row_id',U),('visibility',T),('description',T)])
table('master_parties','기업·기관·개인·투자기구의 공통 참여자',[('name',T),('party_kind',T),('country_code',T),('identity_status',T),('confidential',B),('source_row_id',U)])
table('master_organizations','기업 기본정보. 임차사·소유주·투자자·대주가 공유',[('party_id',U),('existing_company_id',U),('legal_name',T),('english_name',T),('industry_code',T),('industry_code_system',T),('industry_name',T),('website',T),('founded_on',D),('closed_on',D),('listed_market',T),('ticker',T),('headquarters_address',T),('overview',T),('source_row_id',U)])
table('master_identifiers','코드 발급기관·종류·국가를 포함한 식별자',[('asset_id',U),('party_id',U),('vehicle_id',U),('namespace',T),('identifier',T),('country_code',T),('valid_from',D),('valid_to',D),('verified',B),('source_row_id',U)])
table('master_aliases','옛 이름·약칭·영문명. 자동 동일인 판정 금지',[('asset_id',U),('party_id',U),('vehicle_id',U),('alias',T),('alias_kind',T),('valid_from',D),('valid_to',D),('source_row_id',U)])
table('master_asset_components','단지·동·개별 건물·포트폴리오 포함관계',[('parent_asset_id',U),('child_asset_id',U),('relationship_kind',T),('area_inclusion_method',T),('valid_from',D),('valid_to',D),('source_row_id',U)])
table('master_asset_units','층·호·공간. 전체 건물과 별도 면적 범위',[('asset_id',U),('label',T),('floor_label',T),('unit_kind',T),('rentable_area_m2',N),('exclusive_area_m2',N),('source_row_id',U)])
table('master_occupancies','기업의 입주 및 임대차 이력',[('asset_id',U),('tenant_party_id',U),('unit_id',U),('existing_occupancy_id',U),('contract_key',T),('floors_raw',T),('area_m2',N),('area_basis',T),('started_on',D),('ended_on',D),('as_of',D),('status',T),('source_row_id',U)])
table('master_party_relationships','기업집단·자회사·주주·합병·상호 변경 관계',[('from_party_id',U),('to_party_id',U),('relationship_kind',T),('ownership_pct',P),('valid_from',D),('valid_to',D),('source_row_id',U)])
table('master_party_roles','소유·임차 외 운용·PM·수탁·판매 등 역할',[('party_id',U),('asset_id',U),('vehicle_id',U),('role_kind',T),('ownership_pct',P),('valid_from',D),('valid_to',D),('verification_status',T),('source_row_id',U)])
table('master_company_financials','기간·통화·단위·연결/별도별 기업 재무',[('party_id',U),('period_start',D),('period_end',D),('fiscal_year',I),('report_kind',T),('accounting_standard',T),('consolidation_scope',T),('currency_code',T),('unit_multiplier',N),('revenue',N),('operating_profit',N),('net_income',N),('total_assets',N),('total_liabilities',N),('equity',N),('employee_count',I),('source_row_id',U)])
table('master_business_locations','기업의 본사·지점과 자산 연결',[('party_id',U),('asset_id',U),('location_name',T),('location_kind',T),('address',T),('country_code',T),('started_on',D),('ended_on',D),('source_row_id',U)])
table('master_vehicle_relationships','모자펀드·클래스·재간접 관계',[('parent_vehicle_id',U),('child_vehicle_id',U),('relationship_kind',T),('ownership_pct',P),('valid_from',D),('valid_to',D),('consolidation_treatment',T),('source_row_id',U)])
table('master_team_assignments','역할·조직·기간별 담당자. 이름과 인증ID 구분',[('vehicle_id',U),('asset_id',U),('source_member_id',U),('role_kind',T),('member_name_raw',T),('department_raw',T),('valid_from',D),('valid_to',D),('source_row_id',U)])
table('master_loan_contracts','계약 식별이 확인된 대출. 대주 스냅샷과 분리',[('vehicle_id',U),('borrower_party_id',U),('external_contract_id',T),('name',T),('currency_code',T),('signed_on',D),('maturity_on',D),('commitment_amount',N),('source_row_id',U)])
table('master_asset_links','기존 서비스와 원본 자산의 검토·승인 연결',[('object_id',U),('asset_id',U),('existing_building_id',U),('existing_complex_id',U),('existing_tower_id',U),('status',T),('evidence',J),('reviewed_by',U),('reviewed_at','timestamptz'),('source_row_id',U)])
table('master_review_issues','중복·불일치·누락·명칭 연결 검토',[('issue_kind',T),('severity',T),('source_row_id',U),('related_source_row_ids',J),('entity_table',T),('entity_id',U),('details',J),('status',T),('resolution_note',T)])

def build():
    books=json.loads((ROOT/'workbooks.json').read_text())
    dictionary=[]
    for b in books:
        source=b['file'].split('_')[0];s=b['sheets'][0]
        assert len(MAP[source])==len(s['fields']),(source,len(MAP[source]),len(s['fields']))
        for f,m in zip(s['fields'],MAP[source]):
            notes=[]
            if m['type']=='x':notes.append('내보내기 화면 표시이므로 원본에만 보관. 업무 속성으로 적재하지 않음')
            if m['type']=='t' and any(x in f['label'] for x in ['코드','등록번호','순번']):notes.append('앞자리 0과 문자 포함을 보존. 숫자로 변환하지 않음')
            if m['type']=='b':notes.append('Y=true, N=false, 공란=NULL. 공란을 false로 간주하지 않음')
            if m['type']=='n':notes.append('NUMERIC 소수 정밀도 보존. 통화·단위·면적 범위 확인. 공란과 0 구분')
            if m['type']=='p':notes.append('퍼센트포인트 그대로 보존: 3.44는 3.44%. 0~1로 자동변환 금지')
            if m['type']=='d':notes.append('원본 문자열 보관. 2999/9999년은 sentinel 후보로 NULL+원문 보존. 1월1일의 날짜 정밀도는 확인 필요')
            if m['type']=='ts':notes.append('타임존 없는 원본 timestamp. 한국시간 여부 확인 전 임의 UTC 변환 금지')
            if m['type']=='i':notes.append('정수로 해석되는 값만 변환. 범위·설명 혼합값은 검토 목록과 원문 보존')
            if m['field']=='aum_entered_on':notes.append('2026-10-12 현재 해석은 시스템 입력일이며 향후 기준 변경 가능. 원본 날짜를 보존하고 entered_on_interpretation 및 변경 이력으로 해석을 관리')
            if m['table']=='master_beneficiary_positions' and m['field'] in ('commitment_amount','funded_amount','unfunded_amount','subscription_redemption_amount'):notes.append('AUM 원화 금액과 대조하여 KRW로 판단. 원본 통화 표기 없음: inferred_krw_cross_report. 금액 자체는 보존')
            if m['field'].endswith('_summary') or m['field'] in ['source_distributors','source_trustee','source_administrator','source_local_manager','source_property_manager','source_seller','source_buyer']:
                notes.append('문자열 목록은 관계 원본 관측치. 쉼표로 자동 분할하거나 기업 동일성 확정 금지')
            if 'vehicle_' in m['field'] and m['table']!='master_vehicles':notes.append('원본 보고서 관측값. 마스터 펀드 기본정보를 덮어쓰지 않음')
            dictionary.append(dict(source_file=b['file'],sheet=s['name'],column=f['column'],source_label=f['label'],target_table='source_rows' if m['type']=='x' else m['table'],target_field=m['field'],postgres_type=types[m['type']],nonempty=f['nonempty'],blank=f['blank'],observed_types=f['types'],notes=notes))
    assert len(dictionary)==248
    return dictionary

if __name__=='__main__':
    dictionary=build()
    for name,obj in [('field-dictionary.json',dictionary),('model.json',TABLES)]:
        p=ROOT/name;p.write_text(json.dumps(obj,ensure_ascii=False,indent=2));os.chmod(p,0o600)
    print(json.dumps({'mapped_columns':len(dictionary),'master_tables':len(TABLES)},ensure_ascii=False))
