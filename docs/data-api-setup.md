# 상세페이지 데이터 연결 신청

## 1. 토지 경계 · 토지특성 · 공시지가

[VWorld](https://www.vworld.kr/)에 가입/로그인하고 오픈API 인증키를 신청합니다.

- 서비스명: Workplace Seoul
- 운영 사이트: `https://this8369.github.io/workplace-seoul/`
- 운영 도메인: `https://this8369.github.io`
- 용도: 오피스 자산 상세페이지의 필지 경계, 토지특성, 토지이용계획 및 개별공시지가 조회
- 사용할 데이터: **연속지적도**, **토지특성정보**, **토지이용계획정보**, **개별공시지가정보**
- 로컬 테스트는 발급 화면이 지원하는 도메인 규칙에 따라 `http://127.0.0.1:5173`을 별도로 등록하거나 개발용 키로 구분합니다.

연속지적도는 [공식 Data API 안내](https://www.vworld.kr/dev/v4dv_2ddataguide2_s002.do?svcIde=cadastral)의 `LP_PA_CBND_BUBUN`을 사용합니다. 일반 data.go.kr 건축물대장 키와 별개입니다. 토지 속성정보의 운영단계 승인은 제공기관 설정에 따릅니다.

발급한 키는 프로젝트의 Git 제외 파일 `data/private/vworld-key`에 저장합니다. 도메인은 `data/private/vworld-domain`에 저장합니다. 공개 프런트엔드 환경변수나 Git에 키를 넣지 않습니다.

관련 신청/설명 페이지:
- [토지특성정보](https://www.data.go.kr/data/15123549/openapi.do)
- [토지이용계획정보](https://www.data.go.kr/data/15123973/openapi.do)
- [개별공시지가정보](https://www.data.go.kr/data/15124014/openapi.do)

## 2. 주변 시설 검색

이번 연결은 같은 VWorld 인증키의 **검색 API**를 사용한다. 별도 Kakao 키는 필요하지 않다. 신청 화면의 활용 API는 **2D데이터 API · 국가중점 API · 검색 API · 지오코더 API**를 선택한다.

- [VWorld 검색 API](https://www.vworld.kr/dev/v4dv_search2_s001.do): 장소 검색, 경위도와 bbox 조건
- [VWorld 공공데이터 이용정책](https://www.vworld.kr/v4po_prcint_a006.do): 출처 표시
- 공급자 장소 분류를 검사한 지하철역·버스정류장·학교·의료시설·은행·편의점·공공기관을 1km 이내에서 연결한다.
- 도보시간은 직선거리에서 환산하지 않는다.

## 3. 실제 도보 시간

[SK open API TMAP](https://openapi.sk.com/products/calc?menuSeq=5&svcSeq=4)의 **보행자 경로안내** 사용을 신청하고 앱키를 준비합니다. 사용량·요금은 신청 시 선택한 상품 기준입니다.

- 비공개 키 파일: `data/private/tmap-key`
- 보행 경로 연결 전에는 직선거리만 표시합니다. 직선거리로 도보 시간을 만들어 넣지 않습니다.

## 이미 작동하는 연결

국토교통부 건축HUB 건축물대장 키는 정상 작동합니다. 운영 자산의 지번은 행정표준코드관리시스템에서 받은 법정동 코드와 결합해 조회하며, 자산 식별이 확인된 대장만 공개 상세페이지에 연결합니다. 개발사업의 기존 건물대장을 신축 계획 정보로 사용하지 않습니다.

2026-09-28 VWorld 인증키의 연속지적도·국가중점 속성·검색 API 정상 응답을 확인하고 수집기에 연결했다.
