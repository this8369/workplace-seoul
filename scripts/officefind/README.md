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

지도에서는 운영 자산에 임대·전용면적을 모두 표시한다. 개발 자산에는 NOC와 전용면적 대신 `development_records`의 소유주·시행주체 및 시공사를 표시한다. 개발 자산 배경색은 운영 자산과 구분한다. 상세 개요에는 두 면적과 별도의 출처 링크가 표시된다.
