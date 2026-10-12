import importlib.util,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('model',Path(__file__).with_name('igis-master-model.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
labels={}
for f in m.build():labels[(f['target_table'],f['target_field'])]=f['source_label'].replace('\n',' ')
labels[('master_aum_snapshots','aum_entered_on')]='AUM 입력일자 (원본 항목)'
labels[('master_aum_snapshots','entered_on_interpretation')]='입력일자 해석 기준'
extra={'name':'이름','party_kind':'구분','country_code':'국가 코드','identity_status':'동일성 확인 상태','confidential':'제한 정보','asset_kind':'자산 구분','primary_use':'주 용도','address':'주소','latitude':'위도','longitude':'경도','gross_area_m2':'연면적(㎡)','completion_year':'준공연도','lifecycle_status':'자산 상태','description':'설명','visibility':'공개 범위','source_exported_on':'원본 추출일','source_system':'원본 시스템','maturity_raw':'원문 만기일','maturity_kind':'만기일 구분','object_kind':'투자대상 구분','resolution_status':'연결 상태','currency_code':'통화','currency_status':'통화 확인 상태','amount_basis':'금액 기준','business_as_of':'업무 기준일','business_as_of_status':'기준일 확인 상태','aggregation_status':'합산 기준','ownership_pct':'지분율(%)','allocated_amount':'배분 금액','relationship_started_on':'관계 시작일','relationship_ended_on':'관계 종료일','legal_name':'법인명','english_name':'영문명','industry_code':'산업 코드','industry_code_system':'산업 분류 체계','industry_name':'업종','website':'홈페이지','founded_on':'설립일','closed_on':'폐업일','listed_market':'상장 시장','ticker':'종목 코드','headquarters_address':'본사 주소','overview':'소개'}
out={}
for t,v in m.TABLES.items():
 out[t]=[{'key':k,'label':labels.get((t,k),extra.get(k,k)),'type':typ,'readonly':k in ('source_code','source_system','source_exported_on','visibility','reviewed_at') or k.endswith('_id') or k in ('reviewed_by','evidence','related_source_row_ids')} for k,typ in v['columns'].items() if not k.endswith('_id') and k not in ('reviewed_by','evidence','related_source_row_ids')]
Path('src/lib/master-fields.ts').write_text('// Field definitions only. No private records or source values.\nexport interface MasterField {key:string;label:string;type:string;readonly:boolean}\nexport const masterFields: Record<string, MasterField[]> = '+json.dumps(out,ensure_ascii=False,indent=2)+';\n')
