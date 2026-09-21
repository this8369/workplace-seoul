import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseOffice,
  identityMatch,
} from "../../scripts/officefind/parser.mjs";
const page = (r = 173, e = 95.5) =>
  `<h1 class="office-name">테스트타워</h1><div class="office-address">서울 강남구 강남대로 560 (논현동 50)</div><table><tr><th>기준층 면적</th><td>임대 <span data-py="${r}" data-m2="52.3">${((r * 400) / 121).toFixed(2)}m²</span> / 전용 <span data-py="${e}" data-m2="28.8">${((e * 400) / 121).toFixed(2)}m²</span></td></tr></table><h3>기준층 임대시세 <small>2026년 기준</small></h3>`;
test("floor parser separates source-stated units without using incorrect data-m2", () => {
  const p = parseOffice(page(), "https://officefind.co.kr/test");
  assert.equal(p.rentable_pyeong, 173);
  assert.equal(p.exclusive_pyeong, 95.5);
  assert.equal(p.period, "2026년 기준");
  assert.deepEqual(p.warnings, []);
  assert.equal(
    parseOffice(page().replace("571.90m²", "571.<sup>90</sup>m²"), "")
      .rentable_pyeong,
    173,
  );
});
test("missing, zero, inverted and contradictory floor measurements are not guessed", () => {
  assert.equal(parseOffice("", "").rentable_pyeong, null);
  assert.equal(parseOffice(page(0, 0), "").exclusive_pyeong, null);
  assert.deepEqual(parseOffice(page(10, 20), "").warnings, [
    "exclusive-exceeds-rentable",
  ]);
  assert.equal(
    parseOffice(page().replace("571.90m²", "800m²"), "").rentable_pyeong,
    null,
  );
});
const b = {
  id: "1",
  name: "테스트타워",
  address: "서울특별시 강남구 논현동 50",
  road_address: "서울특별시 강남구 강남대로 560",
};
const source = parseOffice(page(), "");
test("asset matching requires address identity and disambiguates shared towers", () => {
  assert.equal(identityMatch(b, source, [b]).ok, true);
  assert.equal(
    identityMatch(
      {
        ...b,
        address: "서울 강남구 논현동 51",
        road_address: "서울 강남구 강남대로 562",
      },
      source,
    ).ok,
    false,
  );
  assert.equal(
    identityMatch({ ...b, name: "테스트타워 <A동>" }, source).ok,
    false,
  );
  assert.equal(
    identityMatch({ ...b, name: "다른 타워" }, source, [b, { ...b, id: "2" }])
      .ok,
    false,
  );
  assert.equal(
    identityMatch(
      { ...b, latitude: 37.5, longitude: 127.0 },
      { ...source, latitude: 37.6, longitude: 127.0 },
    ).ok,
    false,
  );
});
test("combined complex data cannot be filled from one component tower", () => {
  assert.equal(
    identityMatch(
      { ...b, name: "광화문 D타워 (D1, D2)" },
      { ...source, name: "디타워 D2" },
    ).ok,
    false,
  );
  assert.equal(
    identityMatch(
      { ...b, name: "파인에비뉴 A,B동" },
      { ...source, name: "파인에비뉴빌딩B동" },
    ).ok,
    false,
  );
});

test("approval parser excludes forecasts and invalid dates, preserves original approval before remodeling", async () => {
  const { parseApproval } = await import("../../scripts/officefind/parser.mjs");
  const approval = (text) => `<th>사용승인</th><td>${text}</td>`;
  const parsed = parseApproval(
    approval("1997-03-03 / 2006-11 리모델링 완료 (30yg)"),
    "2026-09-21",
  );
  assert.equal(parsed.year, 1997);
  assert.equal(parsed.date, "1997-03-03");
  for (const text of [
    "2028년 준공예정",
    "2020-10-31 / 예정",
    "2027-01-01",
    "2020-02-30",
    "0000-00-00",
    "미확인",
  ])
    assert.equal(parseApproval(approval(text), "2026-09-21").date, null);
  assert.equal(parseApproval(approval("2020-02-29"), "2026-09-21").year, 2020);
});
