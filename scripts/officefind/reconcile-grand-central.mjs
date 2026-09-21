// Reviewed common specifications published for physical A/B towers.
// Keep independent NOC observations unchanged.
import pg from "pg";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseOffice, parseApproval, roadKey, plain } from "./parser.mjs";
const root = "data/private/officefind";
const id = "598cc22d-34ce-5830-9b40-be27364484ae";
const scope = "A·B동 공시 기준층";
const urls = [
  "https://officefind.co.kr/남대문로5가253그랜드센트럴-a동",
  "https://officefind.co.kr/남대문로5가831그랜드센트럴-b동",
].map((s) => new URL(s).href);
const hash = (s) => createHash("sha256").update(s).digest("hex");
let pageA;
try {
  pageA = JSON.parse(
    await readFile(`${root}/pages/${hash(urls[0])}.json`, "utf8"),
  );
} catch (e) {
  if (e.code !== "ENOENT") throw e;
  const text = await readFile("/tmp/workplace-grand-central-a.html", "utf8");
  pageA = {
    url: urls[0],
    text,
    hash: hash(text),
    fetched_at: new Date().toISOString(),
  };
  await writeFile(`${root}/pages/${hash(urls[0])}.json`, JSON.stringify(pageA));
}
const pageB = JSON.parse(
  await readFile(`${root}/pages/${hash(urls[1])}.json`, "utf8"),
);
const pages = [pageA, pageB];
const specs = pages.map((p) => ({
  ...parseOffice(p.text, p.url),
  approval: parseApproval(p.text),
}));
for (const [i, s] of specs.entries()) {
  assert.equal(s.name, `그랜드센트럴 ${i === 0 ? "A" : "B"}동`);
  assert.equal(roadKey(s.address), roadKey("서울 중구 세종대로 14"));
  assert.deepEqual(s.warnings, []);
  assert.equal(s.rentable_pyeong, 635.15);
  assert.equal(s.exclusive_pyeong, 340.69);
  assert.equal(s.approval.date, "2020-07-08");
}
const { reviewerEmail, ...config } = JSON.parse(
  await readFile("data/private/db-config.json", "utf8"),
);
const db = new pg.Client({
  ...config,
  password: (await readFile("data/private/db-password", "utf8")).trim(),
  ssl: {
    rejectUnauthorized: true,
    ca: await readFile("data/private/supabase-ca.crt", "utf8"),
  },
  connectionTimeoutMillis: 15000,
});
await db.connect();
try {
  await db.query("begin");
  const b = (
    await db.query("select * from buildings where id=$1 for update", [id])
  ).rows[0];
  assert.equal(b.name, "GRAND CENTRAL (구, SG타워)");
  assert.equal(b.status, "operating");
  assert.equal(roadKey(b.road_address), roadKey(specs[1].address));
  for (const p of pages) {
    const areaHtml = p.text.match(
      /<th[^>]*>\s*연면적\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/,
    )?.[1];
    const area = Number(
      plain(areaHtml)
        .match(/[\d,.]+/)?.[0]
        .replaceAll(",", ""),
    );
    assert.ok(
      Math.abs(Number(b.gross_area_m2) - area) < 1,
      "Whole-building area must match",
    );
  }
  for (const [key, value] of [
    ["typical_floor_rentable_pyeong", 635.15],
    ["typical_floor_exclusive_pyeong", 340.69],
    ["completion_year", 2020],
  ])
    assert.ok(
      b[key] == null || Number(b[key]) === value,
      "Preserve conflicting independent edits",
    );
  const s = specs[1];
  const audit = {
    review_type: "cross-source-common-specification",
    scope,
    reason:
      "A/B pages have the same address, whole-building gross area, typical-floor measurements and approval date. Values are published common specifications for the two physical towers.",
    sources: pages.map((p, i) => ({
      url: p.url,
      hash: p.hash,
      name: specs[i].name,
      observed_at: p.fetched_at,
    })),
    reviewed_at: new Date().toISOString(),
  };
  await db.query(
    `update buildings set typical_floor_rentable_pyeong=$2,typical_floor_exclusive_pyeong=$3,typical_floor_scope=$4,typical_floor_source_url=$5,typical_floor_source_period=$6,typical_floor_collected_at=$7,completion_year=2020,usage_approved_on='2020-07-08',completion_source_url=$5,completion_collected_at=$7 where id=$1`,
    [
      id,
      s.rentable_pyeong,
      s.exclusive_pyeong,
      scope,
      pageB.url,
      s.period,
      pageB.fetched_at,
    ],
  );
  await db.query(
    `update private.officefind_floor_imports set status='reviewed',source_url=$2,source_name=$3,source_address=$4,rentable_pyeong=$5,exclusive_pyeong=$6,source_period=$7,raw_floor=$8,match_reason='cross-source-common-specification',content_hash=$9,audit=audit||$10::jsonb where building_id=$1`,
    [
      id,
      pageB.url,
      s.name,
      s.address,
      s.rentable_pyeong,
      s.exclusive_pyeong,
      s.period,
      s.raw_floor,
      pageB.hash,
      JSON.stringify(audit),
    ],
  );
  await db.query("commit");
  const cache = JSON.parse(await readFile(`${root}/results.json`, "utf8"));
  cache[id] = {
    ...cache[id],
    status: "reviewed",
    source_url: pageB.url,
    rentable_pyeong: s.rentable_pyeong,
    exclusive_pyeong: s.exclusive_pyeong,
    scope,
    audit,
  };
  await writeFile(`${root}/results.json`, JSON.stringify(cache, null, 2));
  console.log(
    (
      await db.query(
        "select name,typical_floor_rentable_pyeong,typical_floor_exclusive_pyeong,typical_floor_scope,completion_year,usage_approved_on from buildings where id=$1",
        [id],
      )
    ).rows[0],
  );
} catch (e) {
  await db.query("rollback");
  throw e;
} finally {
  await db.end();
}
