"""Prepare typed first-import payload. Unknown identities/units are explicit, not guessed."""
import collections, datetime, decimal, hashlib, importlib.util, json, os, re, uuid
from pathlib import Path
spec=importlib.util.spec_from_file_location('model',Path(__file__).with_name('igis-master-model.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
D=m.ROOT;books=json.loads((D/'workbooks.json').read_text());audit=json.loads((D/'audit.json').read_text());existing=json.loads((D/'existing-db.json').read_text())
def uid(s):return str(uuid.uuid5(uuid.NAMESPACE_URL,'workplace-master:'+s))
batch_hash=hashlib.sha256(''.join(sorted(b['sha256'] for b in books)).encode()).hexdigest();batch_id=uid(batch_hash)
payload={'batch':{'id':batch_id,'content_hash':batch_hash,'exported_on':'2026-10-06','source_system':'aurum','status':'loading','source_file_count':6,'source_row_count':5630,'detail_row_count':5627},'files':[],'rows':[],'dictionary':m.build(),'tables':{t:[] for t in m.TABLES},'checks':{}}
rowsindex={};issues=[];nonnumeric=[]
def issue(kind,row_id,details,severity='review'):
 issues.append({'id':uid(kind+str(row_id)+json.dumps(details,sort_keys=True,ensure_ascii=False)),'issue_kind':kind,'severity':severity,'source_row_id':row_id,'details':details,'status':'open'})
def convert(v,typ,row_id,field):
 if v is None:return None
 if typ in ('t','x'):return str(v)
 if typ=='b':
  if v in ('Y','N'):return v=='Y'
 elif typ in ('n','p','i'):
  try:
   d=decimal.Decimal(str(v).replace(',',''))
   if not d.is_finite():raise decimal.InvalidOperation()
   if typ=='i':
    if d!=d.to_integral_value():raise decimal.InvalidOperation()
    return int(d)
   return format(d,'f')
  except decimal.InvalidOperation:pass
 elif typ=='d':
  if str(v).startswith(('2999-','9999-')):
   issue('date_sentinel',row_id,{'field':field,'raw':v});return None
  try:return datetime.date.fromisoformat(str(v)).isoformat()
  except ValueError:pass
 elif typ=='ts':
  try:return datetime.datetime.fromisoformat(str(v)).isoformat()
  except ValueError:pass
 issue('typed_value_review',row_id,{'field':field,'raw':v,'target_type':typ});return None
for b in books:
 source=b['file'].split('_')[0];s=b['sheets'][0];file_id=uid(batch_hash+b['file']);table=m.MAP[source][0]['table']
 payload['files'].append({'id':file_id,'batch_id':batch_id,'name':b['file'],'sha256':b['sha256'],'metadata':{'sheets':[{'name':s['name'],'range':s['range'],'state':s['state'],'header_rows':s['header_rows'],'merged':s['merged']}]},'local_path':str((D/'sources'/b['file']).resolve())})
 cellrows=collections.defaultdict(list)
 for c in s['raw_cells']:cellrows[int(re.search(r'\d+',c['cell']).group())].append(c)
 for r in s['rows']:
  v=r['values'];total=v.get('약칭',v.get('펀드정보 / 약칭')) in ('합계','총계');row_id=uid(file_id+s['name']+str(r['excel_row']));rowsindex[(source,r['excel_row'])]=row_id
  payload['rows'].append({'id':row_id,'file_id':file_id,'sheet_name':s['name'],'excel_row':r['excel_row'],'row_kind':'control' if total else 'detail','values_json':v,'raw_cells':cellrows[r['excel_row']],'row_hash':hashlib.sha256(json.dumps(v,sort_keys=True,ensure_ascii=False).encode()).hexdigest()})
  if total:continue
  record={'id':uid(table+str(v.get('펀드코드') if table=='master_vehicles' else v.get('자산코드') if table=='master_investment_objects' else row_id)),'source_row_id':row_id,'source_system':'aurum','source_exported_on':'2026-10-06'}
  for f,mp in zip(s['fields'],m.MAP[source]):
   if mp['type']=='x':continue
   record[mp['field']]=convert(v[f['label']],mp['type'],row_id,mp['field'])
  if table=='master_vehicles':record.update(maturity_raw=v['만기일'],maturity_kind='sentinel_unconfirmed' if str(v['만기일']).startswith(('2999','9999')) else 'date' if v['만기일'] else 'unknown')
  if table=='master_investment_objects':record.update(object_kind='unclassified',resolution_status='unlinked')
  payload['tables'][table].append(record)
funds={r['source_code']:r for r in payload['tables']['master_vehicles']}
objects={r['source_code']:r for r in payload['tables']['master_investment_objects']}
objbyname=collections.defaultdict(list)
for r in objects.values():objbyname[r['name']].append(r)
for table in ['master_investments','master_loan_positions','master_beneficiary_positions','master_aum_snapshots']:
 for r in payload['tables'][table]:
  r['vehicle_id']=funds[r['vehicle_source_code']]['id']
  if table=='master_investments':
   candidates=objbyname[r['object_name']]
   if len(candidates)==1:r.update(object_id=candidates[0]['id'],resolution_status='source_name_unique')
   else:r.update(resolution_status='ambiguous');issue('investment_object_identity',r['source_row_id'],{'candidates':[c['source_code'] for c in candidates]})
  elif table=='master_loan_positions':r.update(currency_code='KRW',identity_status='source_row_only',amount_basis='reported_KRW')
  elif table=='master_beneficiary_positions':
   r.update(currency_code=None,currency_status='source_unit_unstated',identity_status='source_row_only',confidential=(r['beneficiary_name']=='비공개' or r['investor_category']=='비공개' or funds[r['vehicle_source_code']]['beneficiaries_confidential'] is not False))
  else:r.update(currency_code='KRW',business_as_of=None,business_as_of_status='needs_confirmation',aggregation_status='unconsolidated')

# Seed existing physical property IDs without changing or publishing any existing service rows.
for b in existing['records']['buildings']:
 payload['tables']['master_assets'].append({'id':b['id'],'name':b['name'],'asset_kind':'building','primary_use':'office','country_code':'KR','address':b.get('standard_address') or b['address'],'latitude':str(b['latitude']) if b['latitude'] is not None else None,'longitude':str(b['longitude']) if b['longitude'] is not None else None,'gross_area_m2':str(b['gross_area_m2']),'completion_year':b['completion_year'],'lifecycle_status':b['status'],'existing_building_id':b['id'],'visibility':'internal'})
for match in audit['existing_asset_candidates']:
 for c in match['candidates']:
  # Only a whole-building candidate with name, normalized parcel address AND area evidence is verified.
  strong=c['existing_kind']=='building' and {'exact_normalized_name','normalized_address_candidate','area_within_1pct'}<=set(c['reasons']) and len(match['candidates'])==1
  r=objects[match['asset_code']]
  payload['tables']['master_asset_links'].append({'id':uid(r['id']+c['existing_id']),'object_id':r['id'],'asset_id':c['existing_id'] if c['existing_kind']=='building' else None,'existing_building_id':c['existing_id'] if c['existing_kind']=='building' else None,'existing_tower_id':c['existing_id'] if c['existing_kind']=='tower' else None,'status':'verified_source_evidence' if strong else 'candidate','evidence':c,'source_row_id':r['source_row_id']})
  if strong:r.update(asset_id=c['existing_id'],object_kind='physical_property',resolution_status='verified_source_evidence')

# Directory entries are source names, not verified legal-entity deduplication. Hidden names get per-row IDs.
parties={};roles={}
for table,namefield,idfield,role in [('master_loan_positions','lender_name','lender_party_id','lender'),('master_beneficiary_positions','beneficiary_name','investor_party_id','investor')]:
 for r in payload['tables'][table]:
  name=r[namefield];opaque=name in ('비공개','개인','기타','미상','일반투자자') or r.get('investor_category')=='비공개'
  key=r['source_row_id'] if opaque else name
  pid=uid('party-label:'+key)
  p=parties.setdefault(pid,{'id':pid,'name':name,'party_kind':'undisclosed' if opaque else 'person' if name.startswith('개인(') else 'unresolved','identity_status':'row_scoped' if opaque else 'source_name_only','confidential':opaque,'source_row_id':r['source_row_id']})
  if r.get('confidential'):p['confidential']=True
  r[idfield]=pid
  key=(pid,r['vehicle_id'],role)
  roles[key]={'id':uid('|'.join(key)),'party_id':pid,'vehicle_id':r['vehicle_id'],'role_kind':role,'verification_status':'source_name_only','source_row_id':r['source_row_id']}
payload['tables']['master_parties']=list(parties.values());payload['tables']['master_party_roles']=list(roles.values())
for source,groups in audit['exact_duplicates'].items():
 for group in groups:issue('identical_source_rows_keep_all',rowsindex[(source,group[0])],{'excel_rows':group,'reason':'No contract/branch/investor identifier. No automatic deletion.'})
for source,items in audit['balance_checks'].items():
 if source not in m.MAP:continue
 for item in items:issue('reported_balance_difference',rowsindex[(source,item['row'])],item)
for item in audit.get('aum_cross_report_observations',audit.get('aum_same_date_financial_reconciliation',[])):
 issue('aum_cross_report_observation',None,{**item,'date_alignment':'not_established'},'information')
for source,controls in audit['controls'].items():
 for c in controls:
  if c['difference'] is not None and decimal.Decimal(c['difference'])!=0:issue('export_total_difference',None,{'source':source,**c})
payload['tables']['master_review_issues']=issues
payload['checks']={'source_rows':len(payload['rows']),'detail_rows':sum(r['row_kind']=='detail' for r in payload['rows']),'table_counts':{t:len(rs) for t,rs in payload['tables'].items()},'verified_asset_links':sum(r['status']=='verified_source_evidence' for r in payload['tables']['master_asset_links']),'pending_investment_links':sum(r['resolution_status']=='ambiguous' for r in payload['tables']['master_investments'])}
assert payload['checks']['source_rows']==5630 and payload['checks']['detail_rows']==5627
assert len(payload['tables']['master_vehicles'])==1138 and len(payload['tables']['master_aum_snapshots'])==902
for name,obj in [('initial-import.json',payload),('import-checks.json',payload['checks'])]:
 p=D/name;p.write_text(json.dumps(obj,ensure_ascii=False,indent=2));os.chmod(p,0o600)
print(json.dumps(payload['checks'],ensure_ascii=False,indent=2))
