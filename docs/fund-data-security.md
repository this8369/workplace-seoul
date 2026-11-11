# 이지스 펀드 정보 보안 운영

공개 GitHub Pages는 지도와 공개 자산 정보를 제공한다. 펀드 원본, 투자·대출·실적, 수정 요청과 이력은 운영 DB에 보존하며 공개 사이트와 인증된 브라우저 세션에 제공하지 않는다. 공개 사이트의 이지스 자산 분류는 승인된 건물 정보다.

## 운영 설정

- Supabase의 Database Settings에서 외부 IP 전체 차단, PostgreSQL TLS 강제, 접속·종료 기록을 유지한다. 외부에서 실행하는 기존 DB 반입·마이그레이션 스크립트는 이 설정에서 접속이 거부된다.
- 공개 사이트는 Supabase 공개 키만 사용한다. GitHub Pages의 배포 작업은 `scripts/check-public-build.mjs`로 배포 파일의 비밀키, 내부 펀드 API와 비공개 파일 포함 여부를 확인한다.
- 조직 설정에서 Supabase Assistant 데이터 공유를 Disabled로 유지한다. 운영 DB를 AI 도구나 MCP에 연결하지 않는다. 운영 DB 비밀번호와 원본 사본은 접근이 통제된 내부 보관소에서 관리하고 AI 작업 환경에는 비식별·합성 데이터만 둔다.
- Supabase 관리자 계정에 MFA를 등록한 뒤 조직 보안 설정에서 MFA를 강제한다. 관리 권한과 OAuth 앱은 승인된 대상만 유지한다.
- Postgres 접속 기록과 펀드 테이블 `AUDIT` 이벤트를 확인한다. 조회 감사는 운영 관리 세션을 대상으로 하며 쿼리 본문과 매개변수 값은 기록하지 않는다. 감사 로그에는 필요한 내부 관리자만 접근한다.

## 변경 확인

`npm test`와 공개 빌드 검사를 통과한 뒤 배포한다. 배포 후 공유 URL을 열어 지도·자산 상세가 조회되는지 확인한다. `node --use-system-ca scripts/db/verify-public-detail-api.mjs`는 공개 자산과 사진 조회 및 익명 펀드 조회 거부를 확인한다. 운영 DB에 접속 가능한 승인된 내부 환경에서는 `node --use-system-ca scripts/db/verify-public-fund-boundary.mjs`로 DB 권한과 기록 설정을 확인한다.

펀드 조회가 다시 필요하면 별도 비공개 프로젝트와 사내 접속 경로를 먼저 마련한다. 공개 Data API 없이 승인된 내부 서버만 DB에 접근하도록 구성하고, 사용자별 MFA와 담당 펀드 조회 범위, 조회 기록을 검증한 후 연다. 공개 GitHub Pages에서 내부 펀드 API 권한을 다시 부여하지 않는다.
