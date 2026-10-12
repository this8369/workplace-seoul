import html,json,os
from pathlib import Path
D=Path('data/private/igis-master-20261006')
audit=json.loads((D/'audit.json').read_text());checks=json.loads((D/'import-checks.json').read_text());fields=json.loads((D/'field-dictionary.json').read_text());model=json.loads((D/'model.json').read_text());books=json.loads((D/'profiles.json').read_text())
def e(v):return html.escape(str(v))
def table(headers,rows):return '<div class="scroll"><table><thead><tr>'+''.join('<th>'+e(x)+'</th>' for x in headers)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+e(c)+'</td>' for c in row)+'</tr>' for row in rows)+'</tbody></table></div>'
source_rows=[(b['file'],audit['record_counts'][b['file'].split('_')[0]],len(b['sheets'][0]['fields']),len(audit['total_rows'][b['file'].split('_')[0]])) for b in books]
source_table=table(['원본 파일','업무 행','항목 수','별도 보존한 합계 행'],source_rows)
types=table(['항목','DB 자료형','처리 기준'],[
 ('펀드·자산·외부기관 코드','text','문자와 앞자리 0 보존. string은 앱에서 쓰는 문자열 자료형, PostgreSQL에서는 text.'),
 ('금액·면적·좌수','numeric(30,6)','부동소수점 대신 정확한 십진수. 통화와 면적 범위 별도 관리. API도 금액을 문자열로 전달.'),
 ('비율·금리','numeric(14,6)','원본 퍼센트포인트 보존. 예: 3.44는 3.44%.'),
 ('층수·주차·객실','integer','정수만 변환. 범위·설명 혼합값은 원문 보존 후 검토.'),
 ('Y/N','boolean','공란은 NULL. N이나 0으로 자동 대체하지 않음.'),
 ('날짜','date / timestamp','추출일·업무 기준일·입력일·확인일을 구분. 2999/9999년은 원문 보존 및 확인 대상.'),
 ('원문·복합 구조·근거','jsonb + 원본 XLSX','정형 필드는 typed 컬럼에, 원본 셀·표시 형식·합계 행은 별도 보존.')])
relations=table(['중심 화면','연결 경로','금액·중복 주의'],[
 ('자산','건물 → 투자대상 → 투자관계 → 펀드 → 수익자·대주·AUM','펀드 전체 금액을 건물별 금액으로 반복 합산하지 않음.'),
 ('기업·기관','기업 → 입주·소유·투자·대출·PM 등 역할 → 자산·펀드','같은 이름만으로 법인·지점을 확정 병합하지 않음.'),
 ('투자자','참여자 → 수익자 명세 → 펀드 → 투자대상·자산','비공개 수익자는 행별 별도 식별. 공개된 이름과 법인 동일성은 구분.'),
 ('대주','참여자 → 대출 명세·트렌치 → 펀드·차주·기초자산','계약번호·지점 식별이 없는 동일 행은 각각 유지.'),
 ('펀드','펀드 → 자산 투자 / 다른 펀드·SPC 투자 → 기관별 역할','펀드·PFV·REITs·SPC를 수용. 모자·클래스 연결은 실제 근거 후 확정.'),
 ('MY','공통 원본 수정 → revision 증가 → 변경자·사유·전후 값 기록','최초 엑셀은 증거. 이후 Supabase 정본에 수정이 반영됨.')])
problems=table(['확인 항목','결과','현재 처리'],[
 ('합계 행','3행','업무 데이터에서 분리하되 검산 근거로 보존'),
 ('대주 동일 행','7그룹','지점·계약 식별 누락 가능성. 전부 유지'),
 ('수익자 동일 행','5그룹','비공개 투자자가 여러 명일 수 있어 전부 유지'),
 ('펀드코드+순번으로 자산코드 추정','742건 중 자산명이 다른 22건','추정 코드로 연결하지 않음'),
 ('투자관계 → 원본 자산','981건 중 정확한 이름의 단일 후보 909건, 복수 후보 72건','909건 원본 내 연결. 72건 검토. 건물 동일성 확정과 구분'),
 ('기존 서비스 자산 연결','원본 자산 37건에 연결 후보 52개','이름·주소·면적 확인 4개 승인, 나머지 48개 후보'),
 ('기존 기업·입주관계','각 0건, 임차사 이전 308건','기업 DB 추가 때 기존 이전 기록과 연결. 현재 입주로 간주하지 않음'),
 ('수익자 금액 검산','합계 표시와 행 합계 차이 +5 / +8 / -1원','원문 유지. AUM 원화 금액과의 대조로 KRW 판단 상태 보존'),
 ('수익자 약정-투입-잔여','14행 차이','원문 유지. 자동 잔여금액 계산으로 덮어쓰지 않음'),
 ('AUM-세부 명세 비교','초기 비교에서 212개 차이 관측','입력일은 시스템 입력일로 확인됨. 같은 기준일의 대조가 아니므로 오류 판정에서 제외하고 참고 관측값으로 보존'),
 ('수익자 통화','해외 펀드 157개 중 137개 정확히 일치, 11개는 1원 차이','AUM 원화 금액과 대조하여 KRW 판단. 원본 통화 표기가 없으므로 추론 상태를 명시'),
 ('AUM 날짜','현재는 시스템 입력일로 해석. 향후 기준 변경 가능','원본 날짜 보존. 해석 기준 entered_on_interpretation은 변경 이력으로 관리. 실제 금액 기준일은 미제공으로 NULL 유지')])
future=table(['예정 데이터','준비한 구조','연결 원칙'],[
 ('기업 식별·이름','master_parties / master_organizations / master_identifiers / master_aliases','국가·발급기관·식별번호, 법인명·영문명·별칭 구분'),
 ('기업집단·계열사·주주','master_party_relationships','지분·관계 유형·유효기간 및 출처 보존'),
 ('기업 재무·규모','master_company_financials','연결/별도, 회계기준, 기간, 통화, 표시단위, 직원 수 구분'),
 ('본사·지점','master_business_locations','같은 회사의 여러 위치 및 주소 이력 수용'),
 ('임차 정보','master_occupancies / master_asset_units','기업·건물·층호·면적·계약기간·현재/과거/미확인 구분'),
 ('오피스·호텔·물류·DC·토지·개발','master_assets / master_asset_components','전체 단지와 동·부분 자산을 분리. 소유가 바뀌어도 자산 ID 유지'),
 ('펀드·SPC·간접투자','master_vehicles / master_vehicle_relationships / master_investments','법적 기구와 물리적 건물 분리. 배분·합산 기준을 명시'),
 ('담당자·조직·권한','master_team_assignments / workplace_members / master_access','직원 인증 DB 유지. 기업·투자자 명부를 로그인 사용자로 자동 등록하지 않음')])
dictionary_rows=''.join('<tr>'+''.join('<td>'+e(c)+'</td>' for c in [f['source_file'].split('_')[0],f['column'],f['source_label'],f['target_table']+'.'+f['target_field'],f['postgres_type'],f['nonempty'],' '.join(f['notes'])])+'</tr>' for f in fields)
schema_table=table(['테이블','역할','초기 건수'],[(k,v['description'],checks['table_counts'].get(k,0)) for k,v in model.items()])
links=''.join('<li><a href="'+html.escape(str((D/'sources'/b['file']).resolve()),quote=True)+'">'+e(b['file'])+'</a> · SHA256 <code>'+b['sha256']+'</code></li>' for b in books)
page='''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>IGIS 통합 마스터 DB 설계·적재 보고</title><style>
*{box-sizing:border-box}body{margin:0;background:#f2f4f8;color:#1d2638;font:15px/1.7 -apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',sans-serif}main{max-width:1250px;margin:auto;padding:44px 28px 70px}h1{font-size:34px;line-height:1.3;letter-spacing:-1.5px}h2{font-size:23px;margin:36px 0 16px}h3{font-size:17px;margin:24px 0 10px}p{max-width:960px}header{padding:24px 0 12px}.eyebrow{font-size:12px;letter-spacing:2px;color:#596a92}.lead{font-size:19px;color:#43516d}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:26px 0}.metrics div,section{background:white;border:1px solid #1c284214;border-radius:18px;padding:22px}.metrics b{font-size:27px;display:block}.metrics span{font-size:13px;color:#65728a}section{margin:20px 0}section h2{margin-top:0}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;font-size:13px}th{background:#f2f4f9;color:#43516d;text-align:left;white-space:nowrap}td,th{padding:12px 13px;border-bottom:1px solid #1c284214;vertical-align:top}td{min-width:90px}td:last-child{min-width:220px}code{font-size:11px;word-break:break-all}.diagram{display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px;text-align:center;margin:22px 0}.diagram div{padding:20px;border:1px solid #2b3c8630;border-radius:14px;background:#f8f9fc}.diagram .core{background:#283982;color:white}.diagram strong{display:block;font-size:19px}.diagram small{display:block;line-height:1.7;margin-top:8px}input{padding:13px 16px;width:100%;border-radius:10px;border:1px solid #b8c1d4;margin:10px 0 20px;font:inherit}a{color:#283982}li{margin:9px 0}.muted{color:#6c778c;font-size:13px}@media(max-width:760px){main{padding:20px 15px}h1{font-size:27px}.metrics{grid-template-columns:1fr 1fr}.diagram{grid-template-columns:1fr}section{padding:16px}}</style><main>
<header><div class="eyebrow">WORKPLACE SEOUL / INTERNAL MASTER</div><h1>자산과 기업을 중심으로<br>이지스의 투자 정보를 연결합니다.</h1><p class="lead">최초 엑셀을 근거로 적재하고, 이후 Supabase가 기준 원본이 됩니다. MY의 수정은 원본에 반영되며 변경 이력이 함께 남습니다.</p><p class="muted">설계·적재 기준 2026-10-12 · 원본 추출일 2026-10-06 · 대주·수익자 명세 기준일 2026-08-31</p></header>
<div class="metrics"><div><b>6개 / 248개</b><span>원본 파일 / 전체 항목</span></div><div><b>5,627건</b><span>합계 행 제외 업무 데이터</span></div><div><b>29개</b><span>운영에 추가한 비공개 테이블</span></div><div><b>364개</b><span>기존 건물 ID 그대로 연결</span></div></div>
<section><h2>하나의 원본, 여러 중심 화면</h2><div class="diagram"><div class="core"><strong>자산</strong><small>건물 · 호텔 · 물류 · DC · 토지 · 사업<br>단지 / 동 / 공간 / 과거·현재</small></div><div class="core"><strong>기업·참여자</strong><small>법인 · 기관 · 개인 · 투자기구<br>본사 / 지점 / 계열 / 식별번호</small></div><div><strong>연결 및 이력</strong><small>임차 · 소유 · 투자 · 대출 · 운용<br>관계 유형 / 유효기간 / 출처</small></div><div><strong>투자관계 → 펀드</strong><small>직접 / 간접 / 지분 / 대출<br>모자펀드 / 클래스 / SPC</small></div><div><strong>투자자 · 대주</strong><small>역할별 화면과 명세<br>약정 / 투입 / 잔여 / 트렌치</small></div><div><strong>시점별 금액</strong><small>AUM / 재무 / 거래 / 평가<br>통화 / 기준일 / 합산 범위</small></div></div>'''+relations+'''</section>
<section><h2>전수 확인한 원본</h2>'''+source_table+'''<p>모든 시트를 확인했습니다. 수식·Excel 오류 셀은 없으며 AUM의 2단 병합 헤더를 구분했습니다. 합계 행은 삭제하지 않고 별도 검산 자료로 보관했습니다.</p></section>
<section><h2>자료형과 정형화 기준</h2>'''+types+'''</section>
<section><h2>중복·연결·금액 검산 결과</h2>'''+problems+'''<p>대주 245개 명칭, 수익자 433개 명칭 중 50개가 두 역할에 함께 나타납니다. 이는 명칭 기준이며 법인 수로 단정하지 않습니다. 사업자번호·외부 식별자가 추가되면 명칭 후보를 확정하고 합병·분리 이력을 보존합니다.</p></section>
<section><h2>MY 수정과 이후 파일 갱신</h2><ol><li>최초 XLSX 바이트·해시·시트·행·원문·셀 형식과 248개 항목 매핑을 비공개 DB에 보존합니다.</li><li>일반 사용자는 권한에 따라 읽고, 현재 관리자는 MY에서 자산·기업/기관·펀드를 추가하고 각 명세를 수정할 수 있습니다.</li><li>저장 시 수정자·수정시각·사유·변경 필드·전후 값과 revision을 기록합니다. 이전 revision으로 저장하면 충돌로 거부합니다.</li><li>동일 파일 재실행은 멱등 처리합니다. 새로운 파일을 기존 원본 위에 자동 덮어쓰는 동작은 막았습니다.</li><li>후속 파일은 직전 원본 / 현재 Supabase / 새 원본의 3자 비교 후 승인 반영하도록 확장합니다. 후속 파일 비교·승인 UI는 다음 단계입니다.</li></ol><p>회원 상세는 MY의 건물 정본 수정 값을 읽습니다. 공개 목록에 내부 정보를 자동 승격하지 않습니다. 원본의 펀드·담당자 등 반복 컬럼은 당시 관측값으로 보존하고, 현재 이름은 마스터 관계로 조회합니다.</p></section>
<section><h2>향후 기업 DB를 받을 자리</h2>'''+future+'''<p>호텔 객실·물류·데이터센터 세부 규격은 제공되는 자료의 단위와 범위가 확인되면 유형별 테이블로 확장합니다. 현재 없는 값을 생성하거나 기존 오피스 규격에 억지로 맞추지 않습니다.</p></section>
<section><h2>서비스 및 비공개 경계</h2><ul><li>MY에 자산·기업/기관·펀드·투자자산·투자관계·투자자·대주·AUM 조회를 연결했습니다. 30건씩 요청하고 첫 지도·카드 로딩에는 포함하지 않습니다.</li><li>건물 상세의 이지스 탭에서 확인된 투자관계를 따라 펀드와 관련 명세를 조회합니다. 미확정 자산은 연결 확정 전까지 별도 원본으로 남습니다.</li><li>내부 원본·정본·이력은 private 스키마에 저장합니다. 익명·미등록·비활성·권한 만료 사용자는 직접 테이블과 조회/저장 함수에 접근할 수 없습니다.</li><li>비공개 수익자 및 관련 요약은 제한 권한으로 구분합니다. 변경 이력은 관리자만 조회합니다. 사용자 인증 명부와 투자자·기업 명부는 별개입니다.</li><li>원본과 분석 값은 Git에서 제외된 로컬 비공개 폴더 및 private DB에만 보관합니다. 공개 번들에는 필드 정의와 UI 코드만 포함합니다.</li></ul></section>
<section><h2>테이블 구성</h2>'''+schema_table+'''<p class="muted">추가 6개 운영 테이블: master_import_batches, master_import_files, master_source_rows, master_field_dictionary, master_access, master_change_history.</p></section>
<section><h2>전체 248개 항목 정의</h2><input id="filter" type="search" placeholder="원본 항목명 · 테이블 · 자료형 검색"><div class="scroll"><table id="dictionary"><thead><tr><th>파일</th><th>열</th><th>원본 항목</th><th>저장 위치</th><th>자료형</th><th>값 있는 행</th><th>처리 규칙</th></tr></thead><tbody>'''+dictionary_rows+'''</tbody></table></div></section>
<section><h2>보존한 원본</h2><ul>'''+links+'''</ul><p>원본 출처, 셀 단위 프로파일, 모든 연결 후보, 검산 상세는 같은 비공개 작업 폴더의 JSON으로 보존되어 다음 데이터 추가 시 재사용합니다.</p></section>
</main><script>document.getElementById('filter').addEventListener('input',e=>{const q=e.target.value.trim().toLocaleLowerCase();for(const r of document.querySelectorAll('#dictionary tbody tr'))r.hidden=!r.textContent.toLocaleLowerCase().includes(q)});</script></html>'''
p=D/'IGIS-master-report.html';p.write_text(page);os.chmod(p,0o600)
print(str(p.resolve()))
