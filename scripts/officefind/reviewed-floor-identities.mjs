import { identityMatch } from "./parser.mjs";

// Reviewed on 2026-10-13. These resolve old site-wide/lot addresses only; they
// neither rewrite addresses nor permit other buildings at the same location.
export const reviewedFloorIdentities = [
  {
    id: "c224d492-6fbe-5ed7-b6ef-762a5257f325",
    name: "Anchor 1(브라이튼 여의도 업무시설)",
    road: "서울특별시 영등포구 국제금융로 39",
    sourceName: "앵커원(Anchor1)",
    sourceAddress: "(여의도동 31)",
    path: "/여의도동31앵커원anchor1",
    evidence:
      "https://kind.krx.co.kr/external/2024/04/11/000051/20240409000001/70660.htm",
    reason:
      "KRX 본점 이전 공시의 앵커원·국제금융로 39 확인. 원문 영문명 Anchor1과 일치하며 지도 좌표 약 54m 이내. 기존 지번과 원문 구지번 차이.",
  },
  {
    id: "9dffad90-31bf-5601-8435-095090b7bae2",
    name: "트레이드타워 (무역회관)",
    road: "서울특별시 강남구 영동대로 513",
    sourceName: "트레이드타워",
    sourceAddress: "서울 강남구 영동대로 511 (삼성동 159-1)",
    path: "/삼성동159-1트레이드타워",
    evidence: "https://www.kita.net/info/about/location.do",
    reason:
      "한국무역협회 공식 주소에서 트레이드타워·영동대로 511 확인. 원문 건물명·1988년 준공·연면적 약 107,933㎡가 일치. 플랫폼 원천 주소는 코엑스 단지 대표주소 513.",
  },
  {
    id: "3a37ded2-7c7d-5798-9c7a-e04ac9c32566",
    name: "도심공항타워",
    road: "서울특별시 강남구 영동대로 513",
    sourceName: "한국도심공항타워",
    sourceAddress: "서울 강남구 테헤란로87길 36 (삼성동 159-9)",
    path: "/삼성동159-9한국도심공항타워",
    evidence:
      "https://www.mss.go.kr/common/board/Download.do?bcIdx=1044727&cbIdx=310&streFileNm=10a7264c-11a9-4d3e-b37d-2af7112793c4.pdf",
    reason:
      "중소벤처기업부 공고의 도심공항타워·테헤란로87길 36 확인. 원문 건물명 및 연면적 47,918㎡ 일치. 플랫폼 원천 주소는 코엑스 단지 대표주소 513.",
  },
];

export function matchFloorIdentity(building, source, siblings = []) {
  const automatic = identityMatch(building, source, siblings);
  if (automatic.ok) return automatic;
  const reviewed = reviewedFloorIdentities.find(
    (r) =>
      r.id === building.id &&
      r.name === building.name &&
      r.road === building.road_address &&
      r.sourceName === source.name &&
      r.sourceAddress === source.address &&
      source.url &&
      new URL(source.url).origin === "https://officefind.co.kr" &&
      decodeURIComponent(new URL(source.url).pathname) === r.path,
  );
  return reviewed
    ? {
        ok: true,
        reason: "reviewed-identity-evidence",
        evidence: reviewed.evidence,
        review_note: reviewed.reason,
      }
    : automatic;
}
