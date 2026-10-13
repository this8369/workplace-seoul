# Officefind 기준층 면적 수집

기존 Workplace Seoul 자산의 기준층 임대면적과 전용면적을 분리해 저장한다. 신규 건물 생성, 연면적 기준 변경, 자산 상태 변경 및 공개 전환은 하지 않는다.

## 실행

기존 DB 작업과 동일한 `data/private/db-config.json`, `db-password`, `supabase-ca.crt` 설정을 사용한다. 자격증명과 수집 원문은 Git에 포함하지 않는다.

```sh
node --use-system-ca scripts/db/apply.mjs
node --use-system-ca scripts/officefind/collect-floor-areas.mjs
node --use-system-ca scripts/officefind/verify-floor-areas.mjs
```

- 공개 sitemap, 기존에 확인된 상세 URL, 공개 검색 결과 순으로 후보를 찾는다.
- 동시 요청 없이 최소 2.2초 간격으로 수집한다. 401/403/429 또는 접근 제한 화면이면 중단한다. 우회 기능은 없다.
- 원문은 `data/private/officefind/pages`에 캐시한다. 결과는 자산마다 DB와 `results.json`에 기록하며 오류 건만 재시도한다. 완료된 결과를 재수집하는 정기 동기화 기능은 아니다.
- 원문의 **기준층 면적** 행에서 `임대`와 `전용`의 명시적인 평 값을 각각 읽고, 표시된 ㎡ 값과 교차 확인한다. 해당 행의 `data-m2` 속성은 잘못된 배율이 발견되어 사용하지 않는다.
- 도로명/지번 주소 및 좌표를 대조하고, 복수 동·부분 층 소유 자산은 범위가 명시적으로 일치해야 입력한다. 전용률이나 건물 연면적으로 기준층을 추정하지 않는다.
- 출처 URL, 원문 기준시점, 수집시점은 `buildings`에, 원문 해시와 대조 과정은 접근이 제한된 `private.officefind_floor_imports`에 저장한다. 원본 시트의 면적 기준이 불명확한 필드는 유지하며 새로운 두 필드에 자동 전용하지 않는다.
- 검증기는 저장한 원문과 DB 값을 다시 대조한다. `--repair`는 신원 대조에 실패한 **이번 수집 값이 그대로 남아 있을 때만** 해당 면적을 비우고 검토 대상으로 변경한다. 독립적으로 수정된 값은 덮어쓰지 않는다.

## 누락 항목 재대조

```sh
node --use-system-ca scripts/officefind/audit-floor-coverage.mjs
node --use-system-ca scripts/officefind/collect-floor-areas.mjs --missing --refresh-search --category=office
node --use-system-ca scripts/officefind/verify-floor-areas.mjs
```

`--missing`은 신규 자산뿐 아니라 이전 `unmatched`/`ambiguous` 결과도 다시 대조한다. 두 면적이 이미 채워진 자산과 해외 주소는 제외한다. `--operating`으로 운영 자산만, `--category=office`로 오피스만 선택할 수 있다. `--refresh-search`는 7일이 지난 검색 응답을 다시 확인한다. 확인된 상세 원문은 수집일을 보존하며 재사용한다.

최근 사진 출처와 기존 상세 페이지도 후보로 사용하고, 도로명은 행정구역 표기 차이로 누락되지 않도록 도로명·건물번호로 검색한다. 구명칭의 동 표기는 현재 동 구분으로 사용하지 않으며, IFC 1/2/3과 One/Two/Three IFC는 각각 같은 동으로 대조한다. 같은 주소의 운영 건물과 미래 재개발은 서로 다른 상태로 구분한다. 복수 동을 단일 기준층 면적으로 합산하지 않는다.

DB에 반영할 때 기존 값·출처와 충돌하면 덮어쓰지 않으며, `private.data_record_history`에 출처 URL과 보완 사유를 남긴다. 리스트에는 개별 건물 값 또는 확인된 동별 값을 표시하고, 소수점은 버린다. 상세페이지와 DB 정밀도는 유지한다.

구지번이나 단지 대표주소 때문에 자동 대조가 불가능한 경우 `reviewed-floor-identities.mjs`에 공식 자료 근거와 자산 ID·이름·주소·출처를 모두 고정하여 기록한다. `--ids=ID1,ID2`로 확인한 자산만 반영할 수 있다. 전체 자산에 한 동 면적을 넣거나 재개발 자산에 기존 건물 면적을 연결하지 않는다. `verify-floor-areas.mjs --baseline=수집전스냅샷경로`는 기존 값이 없었던 자산의 이번 입력만 검증하며, `--repair`를 함께 쓰면 대조 실패 값이 현재도 그대로일 때만 제거하고 이력을 남긴다.

지도에서는 운영 자산에 임대·전용면적을 모두 표시한다. 개발 자산에는 NOC와 전용면적 대신 `development_records`의 소유주·시행주체 및 시공사를 표시한다. 개발 자산 배경색은 운영 자산과 구분한다. 상세 개요에는 두 면적과 별도의 출처 링크가 표시된다.

## 준공연도 보완

`node --use-system-ca scripts/officefind/import-completion.mjs`는 이미 저장한 상세 페이지의 사용승인일을 다시 읽어 운영 자산의 `completion_year`와 `usage_approved_on`, 별도 출처·수집시점을 저장한다. 추가 웹 요청은 하지 않는다. 원문이 예정일이거나 미래 날짜인 경우 제외하며, 리모델링 연도로 최초 사용승인연도를 덮어쓰지 않는다. 개발 자산은 실제 준공연도에 예정일을 넣지 않고 기존 `development_records.year/quarter`를 지도·상세·비교 화면의 ‘준공 예정’으로 표시한다.
