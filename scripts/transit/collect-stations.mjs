import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const source = {
  source_name: "서울특별시 역사마스터 정보",
  source_url: "https://data.seoul.go.kr/dataList/OA-21232/S/1/datasetView.do",
};
const cache = "data/private/transit/stations-source.json";
let body;
if (process.argv.includes("--cached")) body = await readFile(cache, "utf8");
else {
  const params = new URLSearchParams({
    onepagerow: "1000",
    srvType: "S",
    infId: "OA-21232",
    serviceKind: "1",
    pageNo: "1",
    ssUserId: "SAMPLE_VIEW",
    strWhere: "",
    strOrderby: "BLDN_ID DESC",
  });
  const response = await fetch(
    "https://data.seoul.go.kr/dataList/dataView.do?" + params,
    {
      method: "POST",
      headers: {
        Referer: source.source_url,
        "X-Requested-With": "XMLHttpRequest",
      },
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok) throw Error(`Station data HTTP ${response.status}`);
  body = await response.text();
  await mkdir("data/private/transit", { recursive: true });
  await writeFile(cache, body);
}
// The public sheet response has unquoted keys and trailing commas. Never eval it.
const data = JSON.parse(
  body
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z_0-9]*)(\s*:)/g, '$1"$2"$3')
    .replace(/,\s*([}\]])/g, "$1"),
);
assert.equal(data.result, "ok");
assert.equal(
  data.list.length,
  data.page.totalCount,
  "Fetch every page before replacing the catalog",
);
const routes = {
  경부선: "1호선",
  경인선: "1호선",
  경원선: "1호선",
  장항선: "1호선",
  일산선: "3호선",
  과천선: "4호선",
  안산선: "4호선",
  진접선: "4호선",
  별내선: "8호선",
  "7호선(인천)": "7호선",
  "9호선(연장)": "9호선",
  분당선: "수인분당선",
  수인선: "수인분당선",
  중앙선: "경의중앙선",
  공항철도1호선: "공항철도",
  "신분당선(연장)": "신분당선",
  "신분당선(연장2)": "신분당선",
  의정부선: "의정부경전철",
  에버라인선: "용인에버라인",
  "수도권 광역급행철도": "GTX-A",
};
const unchanged = new Set([
  "1호선",
  "2호선",
  "3호선",
  "4호선",
  "5호선",
  "6호선",
  "7호선",
  "8호선",
  "9호선",
  "경의중앙선",
  "경춘선",
  "경강선",
  "서해선",
  "신분당선",
  "우이신설선",
  "신림선",
  "인천1호선",
  "인천2호선",
  "김포골드라인",
]);
const stations = data.list.flatMap((r) => {
  const line = routes[r.ROUTE] || (unchanged.has(r.ROUTE) ? r.ROUTE : null);
  assert(line, `Unmapped route: ${r.ROUTE}`);
  // The master includes the future GTX-A Samsung stop, where trains do not stop.
  // https://mediahub.seoul.go.kr/archives/2019678 (2026-10-13)
  if (line === "GTX-A" && r.BLDN_NM === "삼성") return [];
  const name =
    line === "GTX-A"
      ? { 운정: "운정중앙", 용인: "구성" }[r.BLDN_NM] || r.BLDN_NM
      : r.BLDN_NM;
  const lat = Number(r.LAT),
    lon = Number(r.LOT);
  assert(
    lat > 36 && lat < 39 && lon > 125 && lon < 129,
    `Invalid coordinates: ${name}`,
  );
  return [[name, line, lat, lon]];
});
stations.sort(
  (a, b) => a[0].localeCompare(b[0], "ko") || a[1].localeCompare(b[1], "ko"),
);
await mkdir("src/data", { recursive: true });
await writeFile(
  "src/data/subway-stations.json",
  JSON.stringify({
    ...source,
    as_of: new Date().toISOString().slice(0, 10),
    stations,
  }) + "\n",
);
console.log(
  JSON.stringify({ source: source.source_name, stations: stations.length }),
);
