# 준공년도 관리

실물 자산의 준공년도는 `buildings.completion_year`에 저장하며 카드, 지도 말풍선,
상세 화면, 연도 정렬이 같은 필드를 사용한다. 개발 자산의 예정년도는
`development_records`에서 별도로 관리한다.

## 수집과 보완

- `scripts/officefind/import-completion.mjs`는 캐시된 원문을 재사용한다.
  기준층 면적 수집이 보류된 원문도 준공년도 후보가 된다. 건물명·주소·동의
  동일성은 매번 별도로 검증하며 예정일은 실제 준공일로 입력하지 않는다.
- 원본 매매사례, 소유주·설계사 자료 등으로 보완할 때에는
  `data/private/completion-repair-plan.json`에 검토된 변경 계획을 저장한다.
  각 항목은 `id`, `name`, `year`, `date`, `url`, `reason`, `sources`를 포함한다.
- `node --use-system-ca scripts/officefind/reconcile-completion.mjs`는 변경을
  검증한 뒤 롤백한다. `--apply`를 붙이면 트랜잭션으로 반영한다.
  기존 준공년도를 덮어쓰지 않으며 상충하는 값이나 다른 필드의 변경은 거부한다.
- 원문이 연도만 제공하거나 준공식·완공일만 제공하면 `date`는 `null`로 둔다.
  `usage_approved_on`에는 원문에서 확인한 사용승인일만 저장한다.
- 보완 근거는 `completion_source_url`과 `completion_collected_at`에 기록한다.
  공용 주소를 사용하는 서로 다른 동, 기존 건물과 재개발 계획,
  최초 준공과 리모델링·용도변경을 구분한다.

## 검증

`node --use-system-ca scripts/officefind/audit-completion.mjs`로 실물/개발 건수,
준공년도 및 사용승인일 보유 건수, 누락 목록을 확인한다.
검토 계획·원문·변경 이력·자산별 감사 결과는 `data/private/`에만 저장하며
공개 Git 저장소에 포함하지 않는다. 후속 반영 전에 기존 변경 이력을 보관한다.

2026-09-21 보완 결과: 실물 281건 중 207건에서 268건으로 증가했다.
확정 근거가 부족한 13건은 미확인을 유지하며 감사 결과 파일에서 추적한다.
