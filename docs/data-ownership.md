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

Map building bubbles read gross area, completion year and source-reported typical
floor area from `buildings` (`typical_floor_area_pyeong`, nullable), and NOC from
`leasing_quarters`. NOC uses the catalog's latest quarter with its period visible;
missing or conflicting observations stay unknown rather than falling back to an
older quarter. Typical floor area is not estimated from gross area or floor count.
The current source snapshot has no typical-floor or completion-date values, so
those fields remain unknown until supplied. Map bubbles show only the building name at rest. Hover or keyboard focus reveals
all four facts; the bottom-left pointer remains anchored to the building location.
