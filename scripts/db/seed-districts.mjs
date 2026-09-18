import pg from "pg";
import { readFile } from "node:fs/promises";
const read = async (path) => JSON.parse(await readFile(path, "utf8"));
const data = await read("src/data/district-boundaries.json"),
  display = await read("src/data/district-display-boundaries.json");
const rows = [
  [
    "CBD",
    "CBD",
    "종로구 · 중구",
    "#253985",
    ["^서울(?:특별시|시)?\\s.*\\s(?:종로구|중구)(?:\\s|$)"],
  ],
  [
    "GBD",
    "GBD",
    "강남구 · 서초구 · 송파구 신천동·잠실동",
    "#287aab",
    [
      "^서울(?:특별시|시)?\\s.*\\s(?:강남구|서초구)(?:\\s|$)",
      "^서울(?:특별시|시)?\\s.*\\s송파구\\s(?:신천동|잠실동)(?:\\s|$)",
    ],
  ],
  [
    "YBD",
    "YBD",
    "여의도동",
    "#287f78",
    ["^서울(?:특별시|시)?\\s.*\\s영등포구\\s여의도동(?:\\s|$)"],
  ],
  ["Others", "서울 기타", "서울 내 CBD · GBD · YBD 외 지역", "#778397", []],
  [
    "BBD",
    "BBD",
    "성남시 분당구 · 판교 포함",
    "#7561a8",
    ["^(?:경기도?\\s+)?성남시?\\s+분당구(?:\\s|$)"],
  ],
];
// Allow the district immediately after the city name (the normal Korean address).
for (const row of rows)
  row[4] = row[4].map((p) => p.replace("\\s.*\\s", "\\s+"));
const config = await read("data/private/db-config.json");
const db = new pg.Client({
  ...config,
  password: (await readFile("data/private/db-password", "utf8")).trim(),
  ssl: {
    rejectUnauthorized: true,
    ca: await readFile("data/private/supabase-ca.crt", "utf8"),
  },
});
try {
  await db.connect();
  await db.query("begin");
  for (const [order, [key, label, name, color, patterns]] of rows.entries()) {
    const membership = data.features.find((f) => f.properties.key === key),
      visual =
        display.features.find((f) => f.properties.key === key) || membership;
    await db.query(
      `insert into public.districts(key,label,name,color,sort_order,membership_boundary,display_boundary,address_patterns,focus_center,focus_zoom,source_metadata) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict(key) do nothing`,
      [
        key,
        label,
        name,
        color,
        order + 1,
        JSON.stringify(membership),
        JSON.stringify(visual),
        JSON.stringify(patterns),
        key === "Others"
          ? JSON.stringify([126.891, 37.509])
          : key === "CBD"
            ? JSON.stringify([126.98262, 37.56595])
            : key === "YBD"
              ? JSON.stringify([126.9243, 37.52167])
              : null,
        key === "Others" ? 15 : null,
        JSON.stringify({
          membership: {
            source: data.source,
            url: data.sourceUrl,
            date: data.sourceDate,
          },
          display: { ...display, features: undefined },
        }),
      ],
    );
  }
  await db.query("commit");
  console.log(
    "Districts:",
    (
      await db.query(
        "select key,label,sort_order,focus_center,focus_zoom from districts order by sort_order",
      )
    ).rows,
  );
} catch (e) {
  await db.query("rollback").catch(() => {});
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
