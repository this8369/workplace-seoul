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

화면은 따뜻한 미색, 절제된 테라코타 강조색, 얇은 구분선으로 구성합니다.

## 연결 설정

1. 전용 Supabase 프로젝트에 `supabase/migrations/202609180001_core.sql`을 적용합니다.
2. `.env.local`에 프로젝트 URL과 **publishable key**를 설정합니다. `service_role`, secret key, DB 비밀번호는 프런트엔드에 사용하지 않습니다.
3. Supabase Auth에 실제 서비스 URL과 로컬 개발 URL을 등록합니다. 공개 운영 전에는 메일 발송 설정을 확인합니다.
4. Naver Cloud Maps 애플리케이션에서 Dynamic Map을 활성화하고 웹 서비스 URL을 등록한 후 client ID를 설정합니다. SDK는 `ncpKeyId`를 사용합니다.

| 환경변수                      | 내용                      |
| ----------------------------- | ------------------------- |
| VITE_SUPABASE_URL             | 전용 프로젝트 URL         |
| VITE_SUPABASE_PUBLISHABLE_KEY | 공개 클라이언트용 키      |
| VITE_NAVER_MAP_CLIENT_ID      | 네이버 Maps 클라이언트 ID |

미설정·연결 실패·검색 결과 없음은 별도 상태로 표시하며 예시 데이터로 대체하지 않습니다. 실제 데이터는 아직 포함하지 않았습니다. 사이트 호스팅과 API 연결은 별도 설정 후 활성화합니다.

## 데이터 원칙

- 반올림한 평수가 아닌 원본 ㎡에 `121 / 400`을 적용해 10,000평 이상인지 판정합니다.
- 운영 건물은 실제 연면적, 개발 건물은 확인된 계획 연면적을 구분합니다.
- 공개 건물은 출처·확인일을 필수로 갖고, 기본값은 비공개입니다.
- 공개 API는 게시된 적격 건물만 읽습니다. 일반 사용자는 건물 원장을 수정할 수 없습니다.
- 관심 건물은 로그인한 본인만 읽고 추가·삭제할 수 있습니다.
- 원장 변경 이력은 비공개 스키마에 저장합니다.
- 임대차·거래·개발 정보의 확장 방향은 [데이터 모델](docs/data-model.md)을 참고합니다.

`prototype/`는 초기 UX 검토용 시안입니다. 그 안의 수치·위치는 예시이며 프로덕션 빌드·DB에 포함되지 않습니다.
