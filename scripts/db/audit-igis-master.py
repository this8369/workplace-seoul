"""Cross-file identities, controls and candidate links; no live writes or auto merges."""
import collections, datetime, decimal, difflib, json, os, re, unicodedata
from pathlib import Path
D=Path('data/private/igis-master-20261006')
B=json.loads((D/'workbooks.json').read_text())
E=json.loads((D/'existing-db.json').read_text())
by={b['file'].split('_')[0]:b['sheets'][0] for b in B}
def rows(name):return by[name]['rows']
def data(name):return [r for r in rows(name) if r['values'].get('약칭',r['values'].get('펀드정보 / 약칭')) not in ('합계','총계')]
def val(r,k):return r['values'].get(k)
def write(name,obj):
 p=D/name;p.write_text(json.dumps(obj,ensure_ascii=False,indent=2,default=str));os.chmod(p,0o600)
def norm(x):return re.sub(r'[\s·.,\-_/()㈜]','',unicodedata.normalize('NFC',x or '')).casefold()
def address(x):
 s=unicodedata.normalize('NFC',x or '').strip()
 for a,b in [('서울특별시','서울'),('경기도 성남시 분당구','경기 분당구'),('경기도','경기'),('번지','')]:s=s.replace(a,b)
 s=re.sub(r'\s*외\s*\d+\s*필지.*$','',s)
 return norm(s)
def group(rs,key):
 d=collections.defaultdict(list)
 for r in rs:d[key(r)].append(r)
 return d
def dec(v):
 if v is None:return None
 try:return decimal.Decimal(str(v).replace(',',''))
 except decimal.InvalidOperation:return None
funds=data('펀드 관리');assets=data('투자 자산 관리');investments=data('투자 자산 조회');aum=data('펀드 AUM 관리');lenders=data('대주 정보 조회');beneficiaries=data('수익자 정보 조회')
F={val(r,'펀드코드'):r for r in funds};A={val(r,'자산코드'):r for r in assets}
result={'source_files':len(B),'columns':sum(len(s['fields']) for s in by.values()),'source_rows':sum(len(s['rows']) for s in by.values()),'record_counts':{},'total_rows':{},'fund_coverage':{},'exact_duplicates':{},'key_collisions':{},'field_conflicts':{},'controls':{},'date_warnings':[]}
for name in by:
 rr=data(name);result['record_counts'][name]=len(rr)
 result['total_rows'][name]=[r for r in rows(name) if r not in rr]
 result['exact_duplicates'][name]=by[name]['exact_duplicate_rows']
 if '펀드코드' in rr[0]['values'] or name=='펀드 AUM 관리':
  field='펀드정보 / 펀드코드' if name=='펀드 AUM 관리' else '펀드코드'
  codes={val(r,field) for r in rr};result['fund_coverage'][name]={'fund_count':len(codes),'missing_from_fund_master':sorted(str(c) for c in codes-set(F))}
keys={'대주 정보 조회':['펀드코드','기준일자','대주','트렌치','대출인출일','대출만기일'],'수익자 정보 조회':['펀드코드','기준일자','수익자','최초약정일','약정콜일자'],'투자 자산 조회':['펀드코드','순번']}
for name,kk in keys.items():
 groups=group(data(name),lambda r:tuple(val(r,k) for k in kk))
 result['key_collisions'][name]={'key':kk,'groups':[{'key':key,'rows':[r['excel_row'] for r in rs]} for key,rs in groups.items() if len(rs)>1]}

# Code-pattern hypothesis is tested against name/address evidence, not assumed as a FK.
code_matches=[];name_matches=[];unmatched=[]
nameindex=group(assets,lambda r:norm(val(r,'자산(건물)명')))
for r in investments:
 v=r['values'];code='A'+v['펀드코드']+str(v['순번']).zfill(3);a=A.get(code)
 entry={'row':r['excel_row'],'fund':v['펀드코드'],'sequence':v['순번'],'name':v['자산(건물)명'],'hypothesized_code':code}
 if a:
  entry.update(asset_code=code,same_name=norm(val(a,'자산(건물)명'))==norm(v['자산(건물)명']),same_address=norm(val(a,'전체주소(시/도, 구/군 포함)'))==norm(v['전체주소(시/도, 구/군 포함)']))
  code_matches.append(entry)
 ns=nameindex.get(norm(v['자산(건물)명']),[])
 if ns: name_matches.append({**entry,'name_candidates':[val(x,'자산코드') for x in ns]})
 else: unmatched.append(entry)
result['investment_asset_links']={'pattern_code_exists':len(code_matches),'pattern_name_agrees':sum(r['same_name'] for r in code_matches),'pattern_name_disagrees':[r for r in code_matches if not r['same_name']],'name_unique':sum(len(x['name_candidates'])==1 for x in name_matches),'name_ambiguous':[x for x in name_matches if len(x['name_candidates'])>1],'unmatched':unmatched,'all_name_matches':name_matches}
result['repeated_asset_names']=[{'name':val(rs[0],'자산(건물)명'),'codes':[val(r,'자산코드') for r in rs],'addresses':list(dict.fromkeys(val(r,'전체주소(시/도, 구/군 포함)') for r in rs))} for rs in nameindex.values() if len(rs)>1]

# Cross-source properties only compared on a unique identical normalized asset name.
apairs=[('전체주소(시/도, 구/군 포함)','전체주소(시/도, 구/군 포함)'),('기초자산','기초자산'),('사업단계','사업단계'),('연면적(m²)','연면적(m²)'),('연면적(평)','연면적(평)'),('임대면적(㎡)','임대면적(m²)'),('준공(예정)일','준공(예정)일'),('매각여부','매각여부')]
conf=[]
for r in investments:
 ns=nameindex.get(norm(val(r,'자산(건물)명')),[])
 if len(ns)!=1:continue
 a=ns[0]
 for ak,ik in apairs:
  av,iv=val(a,ak),val(r,ik)
  if av is not None and iv is not None and av!=iv:conf.append({'asset_code':val(a,'자산코드'),'investment_row':r['excel_row'],'field':ik,'master_value':av,'query_value':iv})
result['field_conflicts']['asset']=conf
fpairs={'투자 자산 조회': [('펀드명','펀드명'),('운용상태','운용상태'),('최초 설정일','설정일'),('만기일','만기일'),('해지일','해지일'),('투자전략','투자전략')], '펀드 AUM 관리':[('펀드명','펀드정보 / 펀드명'),('운용상태','펀드정보 / 운용상태'),('최초 설정일','펀드정보 / 설정일'),('만기일','펀드정보 / 만기일')], '대주 정보 조회':[('펀드명','펀드명'),('최초 설정일','펀드설정일'),('만기일','펀드만기일')], '수익자 정보 조회':[('펀드명','펀드명'),('최초 설정일','펀드설정일'),('만기일','펀드만기일')]}
for name,pairs in fpairs.items():
 conflicts=[]
 for r in data(name):
  code=val(r,'펀드코드') or val(r,'펀드정보 / 펀드코드');f=F.get(code)
  if not f:continue
  for fk,rk in pairs:
   fv,rv=val(f,fk),val(r,rk)
   if fv is not None and rv is not None and fv!=rv:conflicts.append({'fund':code,'row':r['excel_row'],'field':fk,'master_value':fv,'source_value':rv})
 result['field_conflicts'][name]=conflicts

# Aggregate controls include repeated detail rows exactly as exported; never silently deduplicate financial rows.
control_fields={'대주 정보 조회':['대출약정금액(원)','대출인출금액(원)','대출잔여금액(원)'],'수익자 정보 조회':['총약정금액','투입금액','잔여약정금액'],'펀드 AUM 관리':['사무수탁사 펀드데이터(결산전) / 순자산총액','약정 금액 기준 / Equity 총액(원)','약정 금액 기준 / Loan 총액(원)','약정 금액 기준 / 기준일자 임대보증금(원)','약정 금액 기준 / AUM(원)','투입 금액 기준 / Equity 총액(원)','투입 금액 기준 / Loan 총액(원)','투입 금액 기준 / 기준일자 임대보증금(원)','투입 금액 기준 / AUM(원)']}
for name,fields in control_fields.items():
 cc=[]
 for field in fields:
  vv=[dec(val(r,field)) for r in data(name)];total=sum((v for v in vv if v is not None),decimal.Decimal(0));tr=result['total_rows'][name]
  exported=dec(val(tr[0],field)) if tr else None
  cc.append({'field':field,'sum':str(total),'source_total':str(exported) if exported is not None else None,'difference':str(total-exported) if exported is not None else None,'null_count':sum(v is None for v in vv)})
 result['controls'][name]=cc
result['balance_checks']={}
for name,fields in list(control_fields.items())[:2]:
 mismatches=[]
 for r in data(name):
  vv=[dec(val(r,f)) for f in fields]
  if all(v is not None for v in vv) and vv[0]-vv[1]!=vv[2]:mismatches.append({'row':r['excel_row'],'fund':val(r,'펀드코드'),'difference':str(vv[0]-vv[1]-vv[2])})
 result['balance_checks'][name]=mismatches
ac=[]
for r in aum:
 for basis in ['약정 금액 기준','투입 금액 기준']:
  vv=[dec(val(r,basis+' / '+f)) for f in ['Equity 총액(원)','Loan 총액(원)','기준일자 임대보증금(원)','AUM(원)']]
  if all(v is not None for v in vv) and sum(vv[:3])!=vv[3]:ac.append({'row':r['excel_row'],'fund':val(r,'펀드정보 / 펀드코드'),'basis':basis,'difference':str(sum(vv[:3])-vv[3])})
result['balance_checks']['AUM components']=ac
result['aum_dates']=dict(collections.Counter(val(r,'AUM\n입력일자') for r in aum))
result['aum_cross_report_observations']=[]
# Retain the original entry-date subset for reproducibility, not as an as-of match.
# User clarified that this is provisionally a system entry date, subject to change.
for name,fr,equity in [('대주 정보 조회',('대출약정금액(원)','대출인출금액(원)'),False),('수익자 정보 조회',('총약정금액','투입금액'),True)]:
 rg=group(data(name),lambda r:val(r,'펀드코드'))
 for a in aum:
  code=val(a,'펀드정보 / 펀드코드');rs=rg.get(code,[])
  if not rs or val(a,'AUM\n입력일자')!='2026-08-31':continue
  for basis,field in zip(['약정 금액 기준','투입 금액 기준'],fr):
   expected=dec(val(a,basis+(' / Equity 총액(원)' if equity else ' / Loan 총액(원)')))
   observed=sum((dec(val(r,field)) for r in rs),decimal.Decimal(0))
   if expected is not None and observed!=expected:result['aum_cross_report_observations'].append({'source':name,'fund':code,'basis':basis,'source_sum':str(observed),'aum':str(expected),'difference':str(observed-expected),'date_alignment':'not_established'})

for name in by:
 for r in data(name):
  for k,v in r['values'].items():
   if isinstance(v,str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}',v) and v[:4] in ('2999','9999'):
    result['date_warnings'].append({'source':name,'row':r['excel_row'],'field':k,'raw':v})
party_roles=collections.defaultdict(set)
for rs,key,role in [(lenders,'대주','lender'),(beneficiaries,'수익자','investor'),(funds,'수탁사','trustee'),(funds,'사무관리사','administrator'),(funds,'판매사','distributor'),(investments,'현지운용사','local_manager'),(investments,'현지PM','property_manager'),(assets,'매도인','seller'),(assets,'매수인','buyer')]:
 for r in rs:
  name=val(r,key)
  if name:party_roles[name].add(role)
lset={val(r,'대주') for r in lenders};iset={val(r,'수익자') for r in beneficiaries}
result['parties']={'lender_names':len(lset),'investor_names':len(iset),'shared_exact_names':sorted(lset&iset),'multiple_roles':[{'name':name,'roles':sorted(roles)} for name,roles in party_roles.items() if len(roles)>1],'all_labels':[{'name':name,'roles':sorted(roles)} for name,roles in party_roles.items()]}
result['restricted_investors']={'fund_flag_yes':sum(val(r,'수익자 비공개여부')=='Y' for r in funds),'redacted_rows':[r['excel_row'] for r in beneficiaries if val(r,'수익자구분')=='비공개' or '비공개' in (val(r,'수익자') or '')]}
result['current_db_counts']=E['counts']

# Candidate-only matching with multiple evidence channels, preserving ambiguity and physical scope.
buildings=E['records']['buildings'];towers=E['records']['building_towers']
existing=[]
for b in buildings:existing.append({'id':b['id'],'kind':'building','parent_id':None,'name':b['name'],'addresses':[b.get(k) for k in ['address','standard_address','road_address','parcel_address'] if b.get(k)],'area':b.get('gross_area_m2')})
for t in towers:
 complex_name=next((c['name'] for c in E['records']['building_complexes'] if c['id']==t['complex_id']),'')
 existing.append({'id':t['id'],'kind':'tower','parent_id':t.get('building_id'),'name':complex_name+' '+(t.get('label') or ''), 'addresses':[], 'area':None})
matches=[]
for a in assets:
 v=a['values'];name=norm(v['자산(건물)명']);addr=address(v['전체주소(시/도, 구/군 포함)']);cands=[]
 for e in existing:
  n=norm(e['name']);reasons=[]
  if name and n==name:reasons.append('exact_normalized_name')
  elif min(len(name),len(n))>=4 and (name in n or n in name):reasons.append('contained_name')
  elif min(len(name),len(n))>=4 and difflib.SequenceMatcher(None,name,n).ratio()>=.82:reasons.append('similar_name')
  if addr and addr in [address(x) for x in e['addresses']]:reasons.append('normalized_address_candidate')
  if not reasons:continue
  av=dec(v['연면적(m²)']);bv=dec(e['area']);diff=abs(av-bv)/max(abs(av),abs(bv)) if av and bv else None
  if diff is not None and diff<=decimal.Decimal('.01'):reasons.append('area_within_1pct')
  cands.append({'existing_id':e['id'],'existing_kind':e['kind'],'existing_name':e['name'],'existing_parent_id':e['parent_id'],'reasons':reasons,'area_difference_ratio':str(diff) if diff is not None else None})
 if cands:matches.append({'source_row':a['excel_row'],'asset_code':v['자산코드'],'name':v['자산(건물)명'],'candidates':cands,'status':'review_required'})
result['existing_asset_candidates']=matches
result['existing_candidate_summary']={'source_assets_with_candidates':len(matches),'distinct_existing_entities':len({c['existing_id'] for a in matches for c in a['candidates']}),'exact_name_candidates':sum(any('exact_normalized_name' in c['reasons'] for c in a['candidates']) for a in matches),'exact_name_plus_area_candidates':sum(any('exact_normalized_name' in c['reasons'] and 'area_within_1pct' in c['reasons'] for c in a['candidates']) for a in matches)}
write('audit.json',result)
summary={k:v for k,v in result.items() if k in ['source_files','columns','source_rows','record_counts','fund_coverage','current_db_counts','existing_candidate_summary']}
summary['total_row_counts']={k:len(v) for k,v in result['total_rows'].items()}
summary['exact_duplicate_groups']={k:len(v) for k,v in result['exact_duplicates'].items()}
summary['key_collision_groups']={k:len(v['groups']) for k,v in result['key_collisions'].items()}
summary['asset_code_pattern']={k:v for k,v in result['investment_asset_links'].items() if k in ['pattern_code_exists','pattern_name_agrees','name_unique']}
summary['asset_name_unmatched_investment_rows']=len(unmatched)
summary['asset_name_ambiguous_investment_rows']=len(result['investment_asset_links']['name_ambiguous'])
summary['repeated_asset_name_groups']=len(result['repeated_asset_names'])
summary['conflicts']={k:len(v) for k,v in result['field_conflicts'].items()}
summary['balance_check_mismatches']={k:len(v) for k,v in result['balance_checks'].items()}
summary['aum_cross_report_observation_count']=len(result['aum_cross_report_observations'])
summary['party_counts']={k:v for k,v in result['parties'].items() if k in ['lender_names','investor_names']}
summary['shared_lender_investor_names']=len(result['parties']['shared_exact_names'])
write('summary.json',summary)
print(json.dumps(summary,ensure_ascii=False,indent=2))
