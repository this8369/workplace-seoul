// One-time, private source import. Never publishes records or fabricates verification dates.
import pg from "pg";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const config = JSON.parse(
  await readFile("data/private/db-config.json", "utf8"),
);
const { reviewerEmail, ...connection } = config;
const db = new pg.Client({
  ...connection,
  password: (await readFile("data/private/db-password", "utf8")).trim(),
  ssl: {
    rejectUnauthorized: true,
    ca: await readFile("data/private/supabase-ca.crt", "utf8"),
  },
  connectionTimeoutMillis: 15000,
});
const normalized = JSON.parse(
  await readFile("data/private/normalized.json", "utf8"),
);
const raw = JSON.parse(
  await readFile("data/private/source-snapshot.json", "utf8"),
);
const table = (prefix) => {
  const t = normalized.find((t) => t.title.startsWith(prefix));
  return t.rows.map((row) =>
    Object.fromEntries(t.headers.map((h, i) => [h, row[i]])),
  );
};
const s = (v) => (v == null ? "" : String(v));
const n = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const id = (v) => v || null;
const evidence = (r) => ({
  source_name: "제공 원본 · 검수 전",
  source_url: s(r["원본링크"]),
  as_of: null,
});
const buildings = table("01").map((r) => ({
  id: r["건물ID"],
  name: r["건물명"],
  address: r["원문조합주소"],
  region: r["권역"],
  status: r["자산구분"] === "기성" ? "operating" : "development",
  gross_area_m2: n(r["연면적_㎡"]),
  area_basis: r["면적기준"] === "실제" ? "actual" : "planned",
  latitude: null,
  longitude: null,
  overview: null,
  floors_above: n(r["지상층"]),
  floors_below: n(r["지하층"]),
  completion_year: null,
  parking_spaces: null,
  source_name: "제공 원본 · 검수 전",
  source_url: r["원본링크"],
  verified_on: null,
  source_as_of: r["원본기준월"],
  published: false,
}));
const transactions = table("04").map((r) => ({
  ...evidence(r),
  id: r["거래ID"],
  building_id: id(r["연결건물ID_후보"]),
  building_name: r["건물명_원문"],
  region: r["권역"],
  year: n(r["거래연도"]),
  amount_won: n(r["거래가_원"]),
  building_area_m2: n(r["건물연면적_㎡"]),
  traded_area_m2: n(r["거래면적_㎡"]),
  unit_price_won: n(r["평당가_천원"]) == null ? null : r["평당가_천원"] * 1000,
  seller: s(r["매도인"]),
  buyer: s(r["매수인"]),
  scope: s(r["매입범위"]) || "미확인",
  kind: s(r["거래종류"]),
  note: [r["거래비고"], r["수익률비고"]].filter(Boolean).join(" · "),
  link_status: r["연결건물ID_후보"] ? "candidate" : "unlinked",
  published: false,
}));
const movements = table("05").map((r) => ({
  ...evidence(r),
  id: r["이전기록ID"],
  company_name: r["임차인"],
  period: r["계약분기"],
  kind: s(r["수요형태"]),
  from_building_id: id(r["출발건물ID_후보"]),
  to_building_id: id(r["도착건물ID_후보"]),
  from_name: s(r["출발건물명"]),
  to_name: s(r["도착건물명"]),
  industry: s(r["업종대분류"]),
  link_status: "candidate",
  published: false,
}));
const leasing = table("02").map((r) => ({
  ...evidence(r),
  id: r["임대기록ID"],
  building_id: r["건물ID"],
  period: r["기준분기"],
  deposit: n(r["보증금_원평"]),
  rent: n(r["월임대료_원평"]),
  fee: n(r["관리비_원평"]),
  noc: n(r["NOC_원평"]),
  vacancy: n(r["공실률"]),
  rent_free: n(r["렌트프리_개월년"]),
  area_basis: r["면적기준"],
  vat_basis: r["부가세기준"],
  published: false,
}));
const development = table("03").map((r) => ({
  ...evidence(r),
  id: r["개발기록ID"],
  building_id: r["건물ID"],
  year: s(r["준공예정연도_원문"]),
  quarter: s(r["준공예정분기_원문"]),
  permit: s(r["건축허가일_원문"]),
  started: s(r["실제착공일_원문"]),
  developer: s(r["소유주시행주체"]),
  contractor: s(r["시공사"]),
  progress: s(r["진행상황_원문"]),
  as_of: r["원본기준월"],
  published: false,
}));
const datasets = {
  buildings,
  transactions,
  tenant_movements: movements,
  leasing_quarters: leasing,
  development_records: development,
};
try {
  await db.connect();
  await db.query("begin");
  const sourceId = raw.metadata.spreadsheetId;
  for (const [kind, payload] of [
    ["raw", raw],
    ["normalized", normalized],
  ]) {
    const hash = createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex");
    await db.query(
      "insert into private.source_snapshots(id,source_id,payload) values($1,$2,$3) on conflict(id) do nothing",
      [kind + ":" + hash, sourceId, JSON.stringify(payload)],
    );
  }
  for (const [tableName, rows] of Object.entries(datasets)) {
    if (!rows.length) continue;
    const keys = Object.keys(rows[0]);
    for (const row of rows)
      await db.query(
        `insert into public.${tableName} (${keys.join(",")}) values(${keys.map((_, i) => "$" + (i + 1)).join(",")}) on conflict(id) do nothing`,
        keys.map((k) => row[k]),
      );
  }
  if (reviewerEmail)
    await db.query(
      "insert into private.reviewers(email) values(lower($1)) on conflict do nothing",
      [reviewerEmail],
    );
  await db.query("commit");
  for (const tableName of Object.keys(datasets))
    console.log(
      tableName,
      (
        await db.query(
          `select count(*)::int total,count(*) filter(where published)::int published from public.${tableName}`,
        )
      ).rows[0],
    );
  console.log(
    "private snapshots",
    (await db.query("select count(*)::int from private.source_snapshots"))
      .rows[0].count,
  );
} catch (e) {
  await db.query("rollback").catch(() => {});
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
