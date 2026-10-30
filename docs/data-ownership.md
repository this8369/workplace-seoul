# 데이터 관리 기준

Supabase Postgres를 서비스 데이터의 기준 저장소로 사용한다.

- 건물·표준 주소·좌표: `buildings`
- 매매사례: `transactions`
- 기업·입주·이전: `companies`, `occupancies`, `tenant_movements`
- 분기 임대 지표: `leasing_quarters`
- 개발 사업: `development_records`
- 개인 관심 건물: `favorites`
- 권역명·순서·색·분류 경계·표시 경계·주소 규칙·클릭 중심: `districts`
- 사진·출처·촬영일·대표 여부·구도: `building_images`
- 사진 파일: 비공개 Supabase Storage `building-images` 버킷

사진은 상세용 최대 1600px, 카드용 최대 480px의 WebP 두 파일로 저장한다. 원본을 확대하거나 원본에 포함된 표기를 삭제하지 않는다. 사진과 조감도를 구분한다. 촬영일이 불명확하면 비워두고, 수집일을 촬영일로 대체하지 않는다. 출처 URL과 원본 이미지 URL을 함께 보존한다.

관리 계정은 좌측 하단 **관리 → 사진 관리**에서 사진을 등록·수정·대표 지정한다. 승인된 사진도 해당 건물이 공개되지 않았다면 일반 사용자에게 노출하지 않는다. 건물 일치 여부 확인과 사용권한 확인 상태는 별도 필드이며, 미확인 권한을 승인된 권한으로 바꾸지 않는다. 사진 및 권역 수정 전 값은 비공개 감사 테이블에 기록한다.

소스 코드, 화면 스타일, 아이콘, 배포 설정은 GitHub에서 관리한다. 로컬 권역 JSON은 최초 DB 시드 및 테스트용이다. 연결된 서비스는 DB의 권역 설정을 읽는다. 비교 선택·검색어·메뉴 접힘 같은 화면 상태는 브라우저에서 관리한다.

Google Sheets는 수집·검토 원본이며 DB와 자동 양방향 동기화되지 않는다. 변경을 반영하려면 수집·정규화·검토·DB 반영 절차가 필요하다.

## 사진 수집·등록

`scripts/images/collect.mjs`는 공개 오피스 검색 결과를 건물명과 위치로 대조한다. `discover.mjs`는 검색으로 확인한 소개 페이지의 사진을 추가 수집한다. 수집 결과는 Git에서 제외된 `data/private/images/`에만 저장한다. `prepare-webp.py`가 WebP와 묶음 등록 파일을 만든다.

관리 화면의 사진 묶음 가져오기는 로그인 사용자의 Supabase 권한으로 업로드하며 기존 대표 사진을 보존한다. 개발 서버의 수집한 사진 적용 버튼은 고정된 로컬 묶음 파일만 읽고, 서버에서 관리 권한을 확인한 뒤 반환한다. 이 경로는 배포 빌드에 포함되지 않는다. DB 자격증명과 수집 원본은 Vite에서 직접 제공하지 않는다.

이지스 자산 사진 보완은 `igis-inventory.mjs`로 누락 자산을 추리고 `collect-igis-office.mjs`의 이름·위치 대조 및 개별 출처 조사로 후보를 만든다. `data/private/images/igis/plan.json`에는 직접 확인한 출처만 넣으며, `download-igis.mjs`는 이 목록만 내려받는다. `prepare-igis.py`의 검수표를 확인한 뒤 `approved.json`에 지정한 자산만 등록 묶음에 포함한다. 이름이 비슷해도 주소나 실제 대상이 다른 이미지는 사용하지 않는다. 같은 주소라도 별도 건물·필지이면 자동으로 공유하지 않는다. 등록 후 `igis-inventory.mjs --after`가 최초 목록을 보존하면서 대표 사진과 공개 목록 반영 여부, 남은 항목을 비공개 `result.json`에 기록한다.

Map building bubbles read gross area, completion year and source-reported typical
floor area from `buildings` (`typical_floor_area_pyeong`, nullable), and NOC from
`leasing_quarters`. NOC uses the catalog's latest quarter with its period visible;
missing or conflicting observations stay unknown rather than falling back to an
older quarter. Typical floor area is not estimated from gross area or floor count.
The current source snapshot has no typical-floor or completion-date values, so
those fields remain unknown until supplied. Map bubbles show only the building name at rest. Hover or keyboard focus reveals
all four facts; the bottom-left pointer remains anchored to the building location.

Asset detail change alerts use `private.asset_alert_subscriptions` (per authenticated user and building). The `asset_alert_*`, `set_asset_alert`, and `read_asset_alert` RPCs require `details.read`; the private table has no client grants. In-site alerts include only changes returned by the existing permission-filtered `data_field_history` API, starting at subscription time. Users can disable alerts and acknowledge changes independently. Share links contain only the asset ID and retain the member-only detail access gate.
# 시장 데이터와 이지스 내부 운영정보 (2026-10-13)

## 자산 개요 입력 (2026-10-13)

`building_asset_profiles`는 소유주·공간 특성·면적 기준·운영사·지하철 연결·인증을, `building_power_specs`는 계약수전량(MW)과 이중변전소 여부를 저장한다. 기존 연면적·층수·주차·기준층 면적은 원래 테이블을 재사용한다. 새 항목은 미확인으로 시작하며 비교표의 예시 숫자를 실제 자산 값으로 추정 입력하지 않는다. 전력 밀도는 연면적(평)을 분모로 계산한 W/평이며 에너지 단위 Wh/평과 다르다.

읽기는 `details.read`, 수정은 기존 데이터 관리자 또는 연결된 자산의 펀드 담당 권한으로 제한한다. 다른 회원은 기존 수정 요청 절차를 이용한다. 모든 변경은 기존 낙관적 잠금·이력·알림 경로를 따른다. 등록된 VIEW·자연환경·호텔·운영사 이름은 `asset_vocabulary`에서 재사용한다. 인증은 `asset_certification_options`의 종류·등급을 선택하고 취득/예비/계획/만료 상태를 구분한다. 실제 인증 로고는 등록된 HTTPS 이미지 주소를 이용하며, 없으면 종류와 등급 배지를 표시한다.

`asset_green_spaces`는 서울시 주요 공원현황의 면적 1만㎡ 이상 자료이다. `building_green_spaces`는 자산 좌표와 공식 공원 기준점의 직선거리 500m 이내를 계산한다. 공원 경계·출입구까지 거리나 네이버 장소검색 결과가 아니다. 면적 단위가 잘못되거나 좌표가 없는 원본 행은 제외하며 수동 자연환경 입력은 보존한다. 인근 지하철역도 실제 직연결과 별도로 표시한다. 수집·검증 명령은 `scripts/db/extract-overview-parks.py`, `import-overview-parks.mjs`, `verify-asset-overview.mjs`이다.

자연환경의 등록 범위는 대형 공원·강·호수·산 등이다. 장소 카탈로그의 `kind`는 유형을 구분하며 강·호수의 단일 중심점을 근거로 자동 500m 연결하지 않는다. 현재 자동 연결은 검증된 공원 기준점에 한정한다. 공원 외 자연환경 이름도 직접 추가하고 자동완성에서 재사용할 수 있다.

대지면적·용적률은 프로필에 수동 입력한 값을 보존하고, 값이 없을 때 검증된 최신 대장의 값으로 보완한다. 실제 자산의 연면적·층수·주차·친환경/에너지등급도 대장으로 연결한다. 총괄대장과 동별 대장을 중복 합산하지 않으며, 여러 대장의 범위가 불명확한 경우 임의로 합치지 않는다. 개발 자산의 계획값에 기존 건물 대장을 덮어씌우지 않는다. 대장은 읽기 전용이고 전용률은 확인된 전용/임대 면적 비율을 별도 입력한다. 연면적 대비 오피스 면적이나 임의의 기준층 비율로 추정하지 않는다.

대지면적의 자동 보완은 기본개요의 공식 상위대장 PK를 따라 총괄표제부를 연결한다. 총괄이 없는 개별 부지는 확인된 표제부를 사용하며, 여러 동이 같은 부지를 공유해도 한 번만 합산한다. 단지를 구성하는 모든 동의 부지가 확인된 경우에만 별도 부지의 합계를 공통 대지면적으로 제공한다. 대장 면적이 0이면 공식 대표·부속지번 목록 전체가 검증된 필지 면적과 연결된 경우에 한해 보완한다. 개발 계획에는 기존 부지 면적을 자동 대입하지 않는다. 원본 수집 갱신 시 상위관계와 필지 목록도 갱신하며 수동 입력값은 유지한다.

## 시장·내부 운영정보 경계

플랫폼의 자산·기업 ID가 상위 기준이다. 이지스 펀드 스키마는 투자·금융 모듈의 참고 모델이며 기존 자산, 기업, 대장, 거래, 미디어 구조를 교체하지 않는다. 팀 공유용 최종 스키마 제작은 추가 데이터 통합 이후로 보류한다.

- `public.leasing_quarters`는 시장 조사 전용이다. 기존 1,124행은 원본 제공자의 확인에 따라 `provider_code=rsquare`, `data_domain=market_leasing`로 분류했다. 숫자, 원래 출처 표기, 출처 URL은 보존한다. 기본 공급자는 `unconfirmed`이므로 다른 공급자를 자동으로 알스퀘어로 분류하지 않는다.
- 지도·목록 NOC와 상세의 **시장 임대**는 이 시장 자료만 사용한다. 내부 계약 임대료·실제 수납·NOI를 시장값의 빈칸에 대입하거나 시장 집계에 포함하지 않는다.
- `private.igis_lease_contracts`, `igis_lease_terms`: 실제 계약 및 효력 기간별 조건. 계약 임대료·관리비는 통화별 월 총액이며 단위면적당 시장 임대료와 구분한다. 조건의 효력 기간은 종료일 미포함이며 중첩을 차단한다.
- `private.igis_operating_periods`: 실제 운영실적. 집계 기간, 발생/현금주의, 자산 전체/펀드 지분 범위, 통화와 NOI 정의를 기록한다. `igis_cash_entries`의 실제 수납·지급 내역과 중복 합산하지 않는다.
- `private.igis_operating_plans`: 예산·전망 및 시나리오 판본. 실적과 별도 테이블이다. `igis_asset_valuations`는 감정평가·장부·추정 시장가·목표 매각가를 구분한다. 기존 매매사례를 실제 지급내역으로 전환하지 않는다.
- 대장/계획/계약 면적, 준공예정/실제 준공/사용승인, 사무수탁사 기준일/AUM 실제 기준일/입력일, 약정/납입/인출/원금잔액, 회사 재무의 연결/별도와 회계기간은 각각 별도 기준이다. `private.platform_data_domains`에 저장 위치와 분리 원칙을 등록했다. 기존 원본의 미확정 의미나 날짜를 새 실적으로 추정 이관하지 않는다.
- 내부정보는 서버가 확인한 유효한 이지스 회원 신원 **및** `private.igis_operation_grants`의 자산 또는 펀드·업무영역별 권한이 필요하다. 읽기·쓰기를 구분하며 일반 회원·앱 관리자·이름 일치만으로 접근을 허용하지 않는다. 펀드 권한은 확인된 펀드-자산 연결에만 적용하며 자산 전체 실적에는 자산 권한이 필요하다.
- 권한 관리는 기존 기획추진실의 `data_steward()`와 `igis_operation_set_grant` RPC를 사용한다. 알려진 서버 인증 `source_member_id`만 허용한다. HR 미제공 상태에서 직원별 담당 범위를 추정하거나 금융 접근권한을 일괄 부여하지 않았다.
- 내부정보는 별도 RPC와 `igis_operation_history`로 읽고 수정한다. 수정 사유·이전/이후 값·작성자·시각·revision을 기록하고 낙관적 잠금으로 동시 수정 충돌을 차단한다. 일반 자산 이력, 알림 피드, 공개 카탈로그, 범용 마스터 검색에 이 테이블을 추가하지 않는다. 삭제 대신 상태 변경과 추적 가능한 정정을 사용한다.
- 기존 엑셀 원본의 매입/매각 당시 NOI와 감정평가액도 같은 자산 권한으로 보호한다. 일반 마스터 조회·검색·MY 수정·이력·수정 요청함에서 우회 노출되지 않게 처리한다. 원본 값을 새 운영실적에 자동 복제하지 않는다.
- 검증: `node --use-system-ca scripts/db/verify-platform-boundaries.mjs --preview`는 실제 DB 안에서 마이그레이션과 권한 검사를 수행한 뒤 전체 rollback한다. 배포 후에는 `--preview` 없이 실행한다. 임시 실적·권한·회원 검증시간 변경은 모두 rollback하며 운영에 시험 데이터를 남기지 않는다.

## 단지와 동의 범위

`building_complexes`는 대표 이름·목록 합계·공용시설의 상위 단위이고, `building_towers`는 비교할 동 또는 남측/북측 같은 표시 그룹이다. 기존 `buildings` ID를 `building_id`로 연결하여 개별 자산의 임대·토지·대장·미디어·수정 이력을 유지한다. 실제 하위 동은 `parent_tower_id`, 부대시설은 `component_kind=facility`로 구분한다. 부모와 자식, 공용시설을 중복 합산하지 않는다.

목록에는 단지 1개 항목과 전체 연면적·동별 기준층 요약을 표시한다. 상세는 동별 기존 값을 사용하며 PC에서는 18px 간격의 독립 레이어, 모바일에서는 동 탭과 좌우 스와이프를 사용한다. 공용시설은 별도 탭 없이 각 동의 자산 개요에 동일하게 표시한다. 공용 값은 단지 레코드를 참조하므로 양쪽 화면에 복제 저장하지 않는다. 과거 비교표의 중복 원자료는 삭제하지 않으며 `building_facts.complex_id`로 범위를 지정하고 대표 자산의 동일 항목을 우선하는 안정적인 편집 대상을 표시한다.

서리풀은 남측·북측 기존 자산에 연결하고, 제공된 남/북측 오피스와 부대시설 자료는 해당 그룹 아래에 보존한다. 등록 자산 합계와 제공 자료 합계의 기준 차이도 근거로 보존한다. 이오타 서울은 개발구역 제4-2,7지구를 427, 제8-1,6지구를 816으로 표시한다. 숫자 명칭은 기준층 면적과 무관하다.

579개 자산을 점검한 검토안에서 52개 단지를 연결했다. 동일 필지만으로 단지를 확정할 수 없는 10건은 자동 통합에서 제외했다. 검토안과 원본 스냅샷은 `data/private/complexes/`에만 보관한다. `scripts/db/import-complex-workspaces.mjs`는 기본적으로 트랜잭션을 되돌리는 사전 검증이며 `--apply`에만 저장한다. `verify-complex-workspaces.mjs`로 연결과 공개 투영 경계를 검증한다. 공용시설 상세·전력·근거 자료는 공개 카탈로그에 추가하지 않는다.

코엑스·한국무역센터는 2026-10-13 사용자 요청으로 단지 표시에서 제외했다. 아셈타워·도심공항타워·트레이드타워의 `complex_id`를 해제하고 각각 표시한다. 기존 단지/동 근거 레코드는 비공개 보관하며 건물 값과 수정 이력을 삭제하지 않는다. `scripts/db/complex-policies.mjs`의 명시적 개별 자산 정책이 동일 필지 기반 재통합보다 우선하며, 검토안의 활성 단지는 51개다. `ungroup-complexes.mjs`는 기본 사전 검증, `--apply`는 저장이다.

### 단지 자산개요의 편집 범위 (2026-10-13)

- 공통 프로필(소유주·대지면적·용적률·리테일면적·시공사·설계사·VIEW·자연환경·호텔·운영사·지하철·인증)은 `building_complexes.representative_building_id`가 가리키는 프로필을 단일 편집 원본으로 사용한다. 값이 비어 있어도 다른 동의 이전 값으로 되돌리지 않는다.
- 공통 주차·전력은 `building_complexes` 원본을 편집한다. 상세 상단과 자산개요의 연면적은 모두 해당 동의 `buildings.gross_area_m2`를 표시·수정한다. 단지 합계는 목록용 `building_complexes.gross_area_m2`에 유지하며, 개별 동 값이 없어도 단지 합계나 총괄대장 값으로 대체하지 않는다. 사진도 동별 원본을 유지한다.
- 규모, 천정고, Lease Span, 오피스면적과 그 기준, 기준층 전용·임대면적은 해당 동의 기존 원본 ID로 독립 수정한다. 단지 전체 오피스면적을 동별 면적으로 복제하지 않는다.
- 건축물대장은 읽기 전용 근거로 유지한다. 자산개요에서의 보정은 위 범위에 맞는 프로필/건물 원본에 저장한다.
- 저장하면 단지 내 열린 모든 상세 화면의 데이터를 다시 불러온다. 개별 항목 편집창은 해당 항목에 한정해 공통/개별 원본이 다른 필드로 전환되지 않게 한다.
- 중복된 공통 시설·운영 정보 박스는 제거한다. 원본 `building_facts` 및 변경 이력은 유지하고, 자산개요에 대응하는 값만 기존 정상 필드로 통합한다. 통합 스크립트는 기존 값을 덮어쓰지 않으며 상세 변경 내역은 커밋하지 않는 `data/private/complexes/`에 보관한다.

### 시장임대 전용률 연결 (2026-10-29)

알스퀘어 원자료의 전용률은 소수 비율에서 백분율로 변환하고, 기존 자산 ID·임대기록 ID·분기·원본 행 링크·금액이 모두 일치하는 `leasing_quarters.efficiency_pct`에 연결한다. 원자료의 기준월과 동·층 범위는 `efficiency_source_period`, `efficiency_source_scope`에 보존한다. 기준월이 과거 임대분기의 측정일이었다고 소급하지 않는다. NOC나 오피스/연면적으로 전용률을 역산하지 않으며 단가 면적기준·VAT 미확정 상태와 기존 금액은 변경하지 않는다.

단가 면적기준은 별도 검토 후 확정한다. `confirm-market-rate-basis.mjs`는 위 ID·출처·원금액·전용률이 모두 일치하는 알스퀘어 원자료에만 적용한다. [알스퀘어 공식 NOC 정의](https://help.analytics.rsquareon.com/ko/articles/데이터-b6ed1302) 및 원자료 NOC와의 대조를 근거로 보증금·월임대료·관리비를 `임대면적 기준`으로 명시한다. 사용자가 입력한 다른 기준 및 원금액·NOC·VAT는 보존한다. 신규 원자료 가져오기도 이 검증된 형식에만 같은 기준을 적용한다. 계산기의 입력은 전용면적이며, 단가 기준이나 전용률을 이용자에게 선택시키지 않는다. 시장 NOC는 표의 원래 NOC를 그대로 사용하고 보증금을 제외한 월 임대료·관리비 합계와 구분한다. 화면 표시만 소수점 한 자리로 제한한다.

자산개요의 전용률은 동별 독립 항목이다. 원자료에 건물 전체 범위가 확인된 경우에만 해당 프로필의 빈칸을 채우고, 단지 합계·일부 층 자료는 임대 관측값으로만 보관한다. 기존 입력 및 사용자가 비운 값은 보존한다. 계산기는 해당 임대자료의 전용률을 먼저 사용하며, 없는 경우 같은 자산 프로필만 참조한다. 다른 동이나 단지 대표 프로필로 대체하지 않는다.

`scripts/db/import-market-efficiency.mjs`는 사전 검증 후 rollback하며 `--apply`일 때만 저장한다. 변경 전 스냅샷·충돌·동/층 범위 제외·미확보 자산 목록은 `data/private/market-efficiency/`에 보관한다. 공공 건축물대장 전유·공용면적은 면적 범위 검증의 보조 근거이며, 계약상 임대면적과의 일치가 확인되지 않으면 임대료 환산용 전용률로 자동 전용하지 않는다. 미확보 항목은 소유주·운영사 임대자료의 정확한 동·층 범위와 출처가 확인된 후 보완한다.

### 동별 상세 주소와 개인 저장 (2026-10-14)

각 건물의 영구 ID를 `?asset=<building UUID>`로 사용한다. 이름이 바뀌어도 공유 주소는 유지되며, 공개 목록에 없는 단지 구성 동은 회원 권한 확인 후 원본 건물을 조회한다. 공개 카탈로그와 캐시에는 이 조회 결과를 합치지 않는다. PC에서 동을 선택하거나 모바일에서 동을 전환하면 주소가 갱신되고 새로고침·뒤로가기에서도 해당 동을 복원한다.

공유 버튼은 해당 동의 주소만 전달한다. 검색어·로그인 정보는 공유 URL에서 제거한다. 관심 건물은 기존 `favorites.building_id`로 동별 저장하며 목록에서 저장한 동을 개별 항목으로 다시 연다. 면적이 미확인인 저장 항목도 유지하고, 회원용 썸네일은 인증된 다운로드를 사용한다.
