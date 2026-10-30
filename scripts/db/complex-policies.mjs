// Explicit product decisions take precedence over shared parcel/register evidence.
export const standaloneComplexes = [
  {
    id: "c5b8632a-3ec0-5d6b-ac11-8029f3f22c4c",
    name: "디큐브시티",
    reason:
      "2026-10-30 사용자 요청: 스페이스케이와 타임워크웨스트는 별도 자산으로 표시. 동일 주소를 근거로 기준층·시장 임대·운영 정보를 합치지 않음",
    buildingIds: [
      "32fd8815-944a-526b-88c1-aa152db6e4ac",
      "c319bb99-b72f-5cda-9148-0a5280c2e93f",
    ],
  },
  {
    id: "4acaec75-4e22-59b8-affc-7732ae6df1ed",
    name: "롯데월드타워",
    reason:
      "2026-10-13 사용자 요청: 롯데월드타워는 몰·부속시설의 단지 합계가 아닌 타워 단독 자산으로 표시",
    buildingIds: ["2f28dba6-5a11-5418-a3d0-7aeaa0b782f0"],
  },
  {
    id: "0a598ba6-381b-52bd-adb9-9208445d1bf7",
    name: "원그로브",
    reason:
      "2026-10-13 사용자 요청: 원그로브는 동을 나누지 않고 기존 단일 자산으로 표시",
    buildingIds: ["c8fcd516-c2f4-579e-b93a-0413ec303fb1"],
  },
  {
    id: "e72264a5-6842-5e09-a17c-d85fa1773d03",
    name: "코엑스·한국무역센터",
    reason:
      "2026-10-13 사용자 요청: 각 건물을 개별 자산으로 표시하고 단지 처리하지 않음",
    buildingIds: [
      "3a37ded2-7c7d-5798-9c7a-e04ac9c32566",
      "16cbf387-80d2-5c99-adeb-f08f89d962d1",
      "9dffad90-31bf-5601-8435-095090b7bae2",
    ],
  },
];
