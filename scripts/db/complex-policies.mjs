// Explicit product decisions take precedence over shared parcel/register evidence.
export const standaloneComplexes = [
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
