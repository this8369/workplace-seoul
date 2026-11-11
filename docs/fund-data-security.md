# 이지스 펀드 정보 보안 운영

공개 GitHub Pages는 지도와 공개 자산 정보를 제공한다. 운영 DB의 실제 펀드 원본, 투자·대출·실적과 관련 수정 요청·이력을 삭제했다. 이지스 자산 분류는 승인된 건물 정보로 유지한다. 로그인한 회원의 이지스 상세에는 한 건의 가상 샘플을 제공한다. 삭제 이전 Supabase 백업은 플랫폼의 보존 기간을 따른다.

## 운영 설정

- Supabase의 Database Settings에서 외부 IP 전체 차단, PostgreSQL TLS 강제, 접속·종료 기록을 유지한다. 외부에서 실행하는 기존 DB 반입·마이그레이션 스크립트는 이 설정에서 접속이 거부된다.
- 공개 사이트는 Supabase 공개 키만 사용한다. GitHub Pages의 배포 작업은 `scripts/check-public-build.mjs`로 배포 파일의 비밀키, 내부 펀드 API와 비공개 파일 포함 여부를 확인한다.
- 조직 설정에서 Supabase Assistant 데이터 공유를 Disabled로 유지한다. 운영 DB를 AI 도구나 MCP에 연결하지 않는다. 운영 DB 비밀번호와 원본 사본은 접근이 통제된 내부 보관소에서 관리하고 AI 작업 환경에는 비식별·합성 데이터만 둔다.
- Supabase 관리자 계정에 MFA를 등록한 뒤 조직 보안 설정에서 MFA를 강제한다. 관리 권한과 OAuth 앱은 승인된 대상만 유지한다.
- Postgres 접속 기록과 펀드 테이블 `AUDIT` 이벤트를 확인한다. 조회 감사는 운영 관리 세션을 대상으로 하며 쿼리 본문과 매개변수 값은 기록하지 않는다. 감사 로그에는 필요한 내부 관리자만 접근한다.

## 변경 확인

`npm test`와 공개 빌드 검사를 통과한 뒤 배포한다. 배포 후 공유 URL을 열어 지도·자산 상세가 조회되는지 확인한다. `node --use-system-ca scripts/db/verify-public-detail-api.mjs`는 공개 자산과 사진 조회 및 익명 펀드 조회 거부를 확인한다. 운영 DB에 접속 가능한 승인된 내부 환경에서는 `node --use-system-ca --experimental-strip-types scripts/db/verify-public-fund-boundary.mjs`로 DB 권한과 기록 설정을 확인한다.

기존 공개 배포가 사용하는 조회 함수의 가상 응답은 `node --experimental-strip-types scripts/db/igis-sample-api.mjs`로 생성한다. 생성된 함수는 회원·자산 분류를 확인하고 코드의 샘플 값만 읽는다. 새 화면은 동일한 샘플을 코드에서 직접 읽는다.

펀드 조회가 다시 필요하면 별도 비공개 프로젝트와 사내 접속 경로를 먼저 마련한다. 공개 Data API 없이 승인된 내부 서버만 DB에 접근하도록 구성하고, 사용자별 MFA와 담당 펀드 조회 범위, 조회 기록을 검증한 후 연다. 공개 GitHub Pages에서 내부 펀드 API 권한을 다시 부여하지 않는다.
