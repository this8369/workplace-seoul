"""Build a review workbook payload from a private source snapshot.
IDs are assigned once to snapshot records and then persisted in the master Sheet.
Never regenerate IDs from live row positions after users start editing the Sheet.
"""
import json, uuid, re, hashlib, argparse
from pathlib import Path
from datetime import date, timedelta

NAMESPACE=uuid.UUID('0f4f4e87-8b67-4dc6-962f-1fc69b4f4a56')
def number(v):
    return v if isinstance(v,(int,float)) and not isinstance(v,bool) else None
def text(v):
    return '' if v is None else str(v).strip()
def value(row,index):
    return row[index] if len(row)>index else None
def asset_name(v):
    name=re.sub(r'[<(\[（]\s*[0-9]+층\s*[~∼–-]\s*[0-9]+층\s*[>)\]）]','',text(v))
    name=re.sub(r'(?:초고|저|중|고)층(?:부)?[0-9]*(?:\s+[0-9]+층\s*[~∼–-]\s*[0-9]+층)?','',name)
    name=re.sub(r'<\s*>|\(\s*\)|\[\s*\]|（\s*）','',name)
    name=re.sub(r'([<(\[（])\s+',r'\1',name)
    name=re.sub(r'\s+([>)\]）])',r'\1',name)
    return re.sub(r'\s+',' ',name).strip()
def normalized(v):
    return re.sub(r'[^0-9a-z가-힣]','',text(v).lower())
def date_value(v):
    if isinstance(v,(int,float)) and 1<v<100000: return str(date(1899,12,30)+timedelta(days=v))
    return text(v)
def build(snapshot):
    tabs=snapshot['tabs']; origin=snapshot['metadata']['spreadsheetId']
    meta={s['properties']['title']:s['properties']['sheetId'] for s in snapshot['metadata']['sheets']}
    def uid(kind,tab,row): return str(uuid.uuid5(NAMESPACE,f'{origin}:{kind}:{meta[tab]}:{row}'))
    def provenance(tab,row): return [tab,row,f'https://docs.google.com/spreadsheets/d/{origin}/edit#gid={meta[tab]}&range=A{row}']
    def digest(r):return hashlib.sha256(json.dumps(r,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
    buildings=[]; quarters=[]; developments=[]; reviews=[]; building_lookup={}; op_rows=[]
    def issue(record,kind,reason,tab,row):reviews.append([uid('issue-'+kind,tab,row),record,kind,reason,'미검토',*provenance(tab,row)])
    for key,tab,start,name_idx in [('operating','기성오피스 1만평+',3,2),('development','신규 공급 예정 1만평+',2,3)]:
        for index,r in enumerate(tabs[key][start:],start+1):
            if not value(r,name_idx):continue
            dev=key=='development'; id=uid('building',tab,index)
            area=number(value(r,13 if dev else 9)); office=number(value(r,11)) if not dev else None
            offset=1 if dev else 0
            parts=[text(value(r,i+offset)) for i in range(4,9)]
            street=' '.join(parts[:3]); lot=parts[3]+('-'+parts[4] if parts[4] not in ('','0') else '')
            address=(street+' '+lot).strip(); name=asset_name(r[name_idx]); region=text(value(r,4 if dev else 3))
            flags=['좌표 미확인','개별 출처·현행 정보 검수 필요']
            if office and area and office<area:flags.append('복합건물 면적 범위 확인')
            if dev and value(r,17) not in ('업무시설',None,''):flags.append('오피스 해당 여부 확인')
            if dev and isinstance(value(r,1),(int,float)) and value(r,1)<=date.today().year:flags.append('준공·진행상황 재확인')
            eligibility='면적충족' if area is not None and area*121>=4000000 else '제외' if area is not None else '면적미확인'
            buildings.append([id,name,region,'개발예정' if dev else '기성',area,area*121/400 if area else None,'계획' if dev else '실제',eligibility,address,office,number(value(r,13)) if not dev else None,text(value(r,17 if dev else 15)),date_value(value(r,16)) if not dev else '',number(value(r,16)) if dev else None,number(value(r,15)) if dev else None,text(value(r,18)) if not dev else '',text(value(r,22)) if not dev else '',text(value(r,23)) if not dev else '',number(value(r,24)) if not dev else None,text(value(r,20 if dev else 1)),None,None,'2026-06',None,'미검수','보류','미연결',None,'; '.join(flags),*provenance(tab,index),digest(r)])
            building_lookup.setdefault((normalized(name),region),[]).append(id)
            for flag in flags[2:]:issue(id,'건물 검수',flag,tab,index)
            if not dev:
                op_rows.append((id,r,index))
                for quarter,start_col in [('2025.1Q',25),('2025.2Q',31),('2025.3Q',37),('2025.4Q',43)]:
                    q=[value(r,start_col+i) for i in range(6)]
                    quarters.append([uid('quarter-'+quarter,tab,index),id,name,quarter,*[number(v) for v in q],*[text(v) for v in q],'원/평','면적 기준 미확인','부가세 미확인','미검수','보류','미연결',None,*provenance(tab,index),digest(q)])
            else:
                developments.append([uid('development',tab,index),id,name,text(value(r,1)),text(value(r,2)),text(value(r,10)),number(value(r,11)),number(value(r,12)),date_value(value(r,18)),date_value(value(r,19)),text(value(r,21)),text(value(r,22)),text(value(r,23)),text(value(r,24)),'2026-06','미검수','보류','미연결',None,*provenance(tab,index),digest(r)])
    def link(name,region):
        ids=building_lookup.get((normalized(asset_name(name)),text(region)),[])
        return (ids[0],'명칭·권역 일치 후보') if len(ids)==1 else ('','복수 후보' if ids else '미매칭')
    transactions=[]
    tab='매매사례 1만평+'
    for index,r in enumerate(tabs['transactions'][2:],3):
        if not value(r,2):continue
        id=uid('transaction',tab,index); bid,state=link(r[2],value(r,3))
        addr=' '.join(text(value(r,i)) for i in range(4,9))
        transactions.append([id,bid,text(r[2]),value(r,1),text(value(r,3)),addr,number(value(r,10)),number(value(r,14)),number(value(r,23)),number(value(r,23))*1000 if number(value(r,23)) is not None else None,number(value(r,24)),text(value(r,25)),text(value(r,28)),text(value(r,32)),text(value(r,33)),text(value(r,34)),text(value(r,35)),text(value(r,36)),text(value(r,37)),text(value(r,55)),state,'미검수','보류','미연결',None,*provenance(tab,index),digest(r)])
        if not bid:issue(id,'거래 연결',state,tab,index)
    leases=[]; tab='기업 임대차 사례 1만평+'
    for index,r in enumerate(tabs['leases'][3:],4):
        if not value(r,3):continue
        id=uid('tenant-move',tab,index); from_id,from_state=link(value(r,8),value(r,4)); to_id,to_state=link(value(r,15),value(r,11))
        leases.append([id,text(value(r,3)),text(value(r,1)),text(value(r,2)),from_id,asset_name(value(r,8)),text(value(r,7)),number(value(r,9)),number(value(r,10)),to_id,asset_name(value(r,15)),text(value(r,14)),number(value(r,16)),number(value(r,17)),text(value(r,19)),text(value(r,20)),text(value(r,18)),from_state,to_state,'미검수','보류','미연결',None,*provenance(tab,index),digest(r)])
        if not to_id:issue(id,'임차이전 연결','도착 건물 '+to_state,tab,index)
    record_names={**{r[0]:r[1] for r in buildings},**{r[0]:r[2] for r in transactions},**{r[0]:r[1] for r in leases}}
    for r in reviews: r.insert(2,record_names.get(r[1],''))
    specs=[
      ('01 건물원장',['건물ID','건물명','권역','자산구분','연면적_㎡','연면적_평','면적기준','면적판정','원문조합주소','오피스면적_㎡','기준층면적_평','주용도','사용승인일_원문','지상층','지하층','규모_원문','주차_원문','엘리베이터_원문','전용률','임대사옥구분','위도','경도','원본기준월','최종검수일','검수상태','반영요청','동기화상태','최종동기화','확인사항','원본탭','원본행','원본링크','초기원본해시'],buildings),
      ('02 임대분기',['임대기록ID','건물ID','건물명','기준분기','보증금_원평','월임대료_원평','관리비_원평','렌트프리_개월년','공실률','NOC_원평','보증금_원문','임대료_원문','관리비_원문','렌트프리_원문','공실률_원문','NOC_원문','금액단위','면적기준','부가세기준','검수상태','반영요청','동기화상태','최종동기화','원본탭','원본행','원본링크','초기원본해시'],quarters),
      ('03 개발계획',['개발기록ID','건물ID','건물명','준공예정연도_원문','준공예정분기_원문','건축구분','대지면적_㎡','건축면적_㎡','실제착공일_원문','건축허가일_원문','소유주시행주체','수탁자','시공사','진행상황_원문','원본기준월','검수상태','반영요청','동기화상태','최종동기화','원본탭','원본행','원본링크','초기원본해시'],developments),
      ('04 거래원장',['거래ID','연결건물ID_후보','건물명_원문','거래연도','권역','주소_원문조합','건물연면적_㎡','거래면적_㎡','거래가_천원','거래가_원','평당가_천원','매도인','매수인','매입목적','투자기구','투자기구상세','매입범위','거래종류','거래비고','수익률비고','연결상태','검수상태','반영요청','동기화상태','최종동기화','원본탭','원본행','원본링크','초기원본해시'],transactions),
      ('05 임차이전',['이전기록ID','임차인','수요형태','계약분기','출발건물ID_후보','출발건물명','출발주소','출발연면적_평','출발전용면적_㎡','도착건물ID_후보','도착건물명','도착주소','도착연면적_평','도착전용면적_㎡','업종소분류','업종대분류','비고','출발연결상태','도착연결상태','검수상태','반영요청','동기화상태','최종동기화','원본탭','원본행','원본링크','초기원본해시'],leases),
      ('06 검수목록',['검수ID','대상기록ID','대상명','구분','확인내용','처리상태','원본탭','원본행','원본링크'],reviews)
    ]
    return [{'title':t,'headers':h,'rows':r} for t,h,r in specs]
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('source');p.add_argument('output');a=p.parse_args()
    output=build(json.loads(Path(a.source).read_text()));Path(a.output).write_text(json.dumps(output,ensure_ascii=False))
    print(json.dumps([{**{'tab':t['title'],'records':len(t['rows']),'columns':len(t['headers'])},'row_widths':sorted(set(map(len,t['rows'])))} for t in output],ensure_ascii=False))
