# Workplace Seoul

연면적 **1만 평 이상** 오피스를 깊이 있게 탐색하는 공간 데이터 플랫폼입니다. 운용·투자 판단에 필요한 정보의 깊이와 누구나 공간을 이해할 수 있는 사용성을 함께 지향합니다.

## 개발

Node.js 22.12 이상을 사용합니다.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

`npm run build`는 TypeScript 검사와 프로덕션 빌드, `npm test`는 면적 경계값·검색·출처 링크 및 로컬 PostgreSQL의 공개 조회·수정 차단·관심 건물 격리를 검증합니다.

## 구성

- React / TypeScript / Vite: 검색, 권역·상태 필터, 목록·지도 연동, 건물 상세, 최대 3개 비교
- Supabase: PostgreSQL, 이메일 링크 로그인, 계정별 관심 건물
- Naver Maps JavaScript API: 실제 지도와 건물 위치
- GitHub Actions: 커밋·PR의 테스트와 빌드 자동 검사

화면은 남색(`#1C2435`), 파란 강조색(`#253985`), 얇은 구분선으로 구성합니다.

## 연결 설정

1. 전용 Supabase 프로젝트에 `supabase/migrations/`의 마이그레이션을 순서대로 적용합니다.
2. `.env.local`에 프로젝트 URL과 **publishable key**를 설정합니다. `service_role`, secret key, DB 비밀번호는 프런트엔드에 사용하지 않습니다.
3. Supabase Auth에 실제 서비스 URL과 로컬 개발 URL을 등록합니다. 공개 운영 전에는 메일 발송 설정을 확인합니다.
4. Naver Cloud Maps 애플리케이션에서 Dynamic Map을 활성화하고 웹 서비스 URL을 등록한 후 client ID를 설정합니다. SDK는 `ncpKeyId`를 사용합니다.

| 환경변수                      | 내용                      |
| ----------------------------- | ------------------------- |
| VITE_SUPABASE_URL             | 전용 프로젝트 URL         |
| VITE_SUPABASE_PUBLISHABLE_KEY | 공개 클라이언트용 키      |
| VITE_NAVER_MAP_CLIENT_ID      | 네이버 Maps 클라이언트 ID |

미설정·연결 실패·검색 결과 없음은 별도 상태로 표시하며 예시 데이터로 대체하지 않습니다. 자산·사진 메타데이터·권역 정보는 Supabase에서 조회합니다.

## 외부 배포

서비스 주소: https://this8369.github.io/workplace-seoul/

`main`에 push하면 `.github/workflows/deploy.yml`이 테스트와 빌드 후 GitHub Pages에 배포합니다. Node.js 22와 `BASE_PATH=/workplace-seoul/`을 사용합니다. 위의 세 가지 공개 클라이언트 환경변수는 GitHub Actions repository variables에 설정합니다. 서버 비밀키나 DB 접속 정보는 배포하지 않습니다.

Supabase Auth의 Site URL과 Redirect URLs에 서비스 주소를 등록하고, 로컬 개발을 위해 `http://127.0.0.1:5173/`도 Redirect URLs에 유지합니다. Naver Maps의 웹 서비스 URL에는 배포 도메인을 허용해야 합니다.

사이트 배포는 데이터 공개 상태를 변경하지 않습니다. 비공개 검수 자산은 기존 권한이 있는 계정으로 로그인해야 볼 수 있습니다. 데이터 공개 범위는 DB의 게시 상태와 RLS 정책에서 관리합니다.

## 데이터 원칙

- 반올림한 평수가 아닌 원본 ㎡에 `121 / 400`을 적용해 10,000평 이상인지 판정합니다.
- 운영 건물은 실제 연면적, 개발 건물은 확인된 계획 연면적을 구분합니다.
- 공개 건물은 출처·확인일을 필수로 갖고, 기본값은 비공개입니다.
- 공개 API는 게시된 적격 건물만 읽습니다. 일반 사용자는 건물 원장을 수정할 수 없습니다.
- 관심 건물은 로그인한 본인만 읽고 추가·삭제할 수 있습니다.
- 원장 변경 이력은 비공개 스키마에 저장합니다.
- 임대차·거래·개발 정보의 확장 방향은 [데이터 모델](docs/data-model.md)을 참고합니다.

`prototype/`는 초기 UX 검토용 시안입니다. 그 안의 수치·위치는 예시이며 프로덕션 빌드·DB에 포함되지 않습니다.
