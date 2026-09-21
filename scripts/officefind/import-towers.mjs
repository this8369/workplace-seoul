// Reviewed physical tower plan only. Public pages, sequential cached requests.
import pg from "pg";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseOffice, plain, roadKey } from "./parser.mjs";
const hash = (s) => createHash("sha256").update(s).digest("hex");
const uuid = (s) => {
  const h = hash("workplace-tower:" + s);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const root = "data/private/officefind";
const plan = JSON.parse(
  await readFile("data/private/tower-import-plan.json", "utf8"),
);
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
let lastRequest = 0;
async function page(url) {
  const file = `${root}/pages/${hash(url)}.json`;
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  await new Promise((r) =>
    setTimeout(r, Math.max(0, lastRequest + 2200 - Date.now())),
  );
  lastRequest = Date.now();
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(20000),
    headers: {
      "User-Agent":
        "WorkplaceSeoul-DataImport/1.0 (public building specifications)",
    },
  });
  if (!response.ok) throw Error(`Source stopped: HTTP ${response.status}`);
  const text = await response.text();
  if (
    /cf-chl-|verify you are human|access denied|captcha challenge/i.test(text)
  )
    throw Error("Source access challenge; stopped");
  const p = {
    url,
    text,
    hash: hash(text),
    fetched_at: new Date().toISOString(),
  };
  await writeFile(file, JSON.stringify(p));
  return p;
}
if (process.argv.includes("--discover")) {
  const results = [];
  for (const term of [
    "시그니쳐",
    "삼성SDS",
    "포스코센터",
    "두산타워",
    "유스페이스",
    "바이오파크",
    "판교테크원",
    "오토웨이",
    "마포T타운",
    "누리꿈",
    "청담스퀘어",
  ]) {
    const url = new URL("https://officefind.co.kr/getOfficeData");
    url.search = new URLSearchParams({
      getType: "office",
      page: "1",
      search_str: term,
      searchSeo: "",
      search_area: "",
    });
    const response = JSON.parse((await page(url.href)).text);
    const rows = (Array.isArray(response) ? response : response.data || []).map(
      (r) => ({ name: r.M_NM, address: r.addr, url: r.seo_url }),
    );
    console.log(term, JSON.stringify(rows));
    results.push({ term, rows });
  }
  await writeFile(
    "data/private/tower-source-discovery.json",
    JSON.stringify(results, null, 2),
  );
  process.exit(0);
}
try {
  await db.connect();
  const buildings = (await db.query("select * from buildings order by id"))
    .rows;
  const collected = [];
  for (const group of plan) {
    const members = buildings.filter((b) =>
      new RegExp(group.pattern).test(b.name),
    );
    assert.ok(members.length, `No members: ${group.name}`);
    assert.ok(members.every((b) => b.status === "operating"));
    const representative =
      members.find((b) => /A,B동/.test(b.name)) || members[0];
    const aggregate =
      members.length === 1 || members.some((b) => /A,B동/.test(b.name));
    const complex = {
      id: uuid(group.key),
      name: group.name,
      representative_building_id: representative.id,
      gross_area_m2: aggregate
        ? Number(representative.gross_area_m2)
        : members.reduce((s, b) => s + Number(b.gross_area_m2), 0),
      area_method: aggregate ? "aggregate_record" : "sum_components",
      source_note:
        "기존 원본의 단지 합산 또는 개별 동 면적. 동별 기준층은 오피스파인드 개별 페이지.",
    };
    const towers = [];
    for (const [index, tower] of group.towers.entries()) {
      if (!tower.url) {
        const member = tower.buildingName
          ? members.find((b) => b.name === tower.buildingName)
          : null;
        if (tower.buildingName) assert.ok(member);
        towers.push({
          id: uuid(group.key + ":" + tower.label),
          complex_id: complex.id,
          building_id: member?.id || null,
          label: tower.label,
          sort_order: index,
          typical_floor_rentable_pyeong: null,
          typical_floor_exclusive_pyeong: null,
          source_name: "동 구성 확인 · 기준층 출처 미확인",
          source_url: null,
          source_period: null,
          collected_at: null,
          content_hash: null,
        });
        continue;
      }
      const p = await page(tower.url),
        s = parseOffice(p.text, p.url);
      assert.equal(s.name, tower.sourceName, `${group.name}: source identity`);
      assert.deepEqual(s.warnings, [], `${s.name}: inconsistent floor units`);
      assert.ok(
        s.rentable_pyeong && s.exclusive_pyeong,
        `${s.name}: missing floor measurement`,
      );
      assert.ok(
        members.some(
          (b) =>
            roadKey(b.road_address) === roadKey(s.address) ||
            (b.latitude &&
              s.latitude &&
              Math.hypot(
                (Number(b.latitude) - s.latitude) * 111000,
                (Number(b.longitude) - s.longitude) * 88000,
              ) < 400),
        ),
        `${s.name}: address / location mismatch`,
      );
      let member = tower.buildingName
        ? members.find((b) => b.name === tower.buildingName)
        : null;
      if (tower.buildingName)
        assert.ok(member, `${s.name}: component not found`);
      // Identically named component rows need independent area evidence, not row order.
      const gfa = Number(
        plain(
          p.text.match(
            /<th[^>]*>\s*연면적\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/,
          )?.[1],
        )
          .match(/[\d,.]+/)?.[0]
          ?.replaceAll(",", ""),
      );
      if (!aggregate && !member) {
        const matches = members.filter(
          (b) => Math.abs(Number(b.gross_area_m2) - gfa) < 1,
        );
        if (matches.length === 1) member = matches[0];
      }
      towers.push({
        id: uuid(group.key + ":" + tower.label),
        complex_id: complex.id,
        building_id: member?.id || null,
        label: tower.label,
        sort_order: index,
        typical_floor_rentable_pyeong: s.rentable_pyeong,
        typical_floor_exclusive_pyeong: s.exclusive_pyeong,
        source_name: "오피스파인드",
        source_url: p.url,
        source_period: s.period,
        collected_at: p.fetched_at,
        content_hash: p.hash,
      });
    }
    collected.push({ complex, members: members.map((b) => b.id), towers });
    console.log(
      group.name,
      towers
        .map(
          (t) =>
            `${t.label}: 임대 ${t.typical_floor_rentable_pyeong} / 전용 ${t.typical_floor_exclusive_pyeong}`,
        )
        .join(" | "),
    );
  }
  await writeFile(
    "data/private/tower-import-reviewed.json",
    JSON.stringify(collected, null, 2),
  );
  if (process.argv.includes("--apply")) {
    const before = (
      await db.query(
        "select id,building_id,period,noc from leasing_quarters order by id",
      )
    ).rows;
    await db.query("begin");
    try {
      await db.query(
        "select pg_advisory_xact_lock(hashtextextended('physical-tower-import',0))",
      );
      for (const group of collected) {
        const c = group.complex;
        await db.query(
          `insert into building_complexes(id,name,representative_building_id,gross_area_m2,area_method,source_note) values($1,$2,$3,$4,$5,$6) on conflict(id) do update set name=excluded.name,gross_area_m2=excluded.gross_area_m2,area_method=excluded.area_method,source_note=excluded.source_note`,
          [
            c.id,
            c.name,
            c.representative_building_id,
            c.gross_area_m2,
            c.area_method,
            c.source_note,
          ],
        );
        const conflicts = await db.query(
          "select id from buildings where id=any($1::uuid[]) and complex_id is not null and complex_id<>$2",
          [group.members, c.id],
        );
        assert.equal(
          conflicts.rowCount,
          0,
          "Preserve independently assigned complexes",
        );
        await db.query(
          "update buildings set complex_id=$2 where id=any($1::uuid[]) and complex_id is distinct from $2",
          [group.members, c.id],
        );
        for (const t of group.towers) {
          const keys = Object.keys(t);
          await db.query(
            `insert into building_towers(${keys.join(",")}) values(${keys.map((_, i) => "$" + (i + 1)).join(",")}) on conflict(id) do update set ${keys
              .filter((k) => k !== "id")
              .map((k) => `${k}=excluded.${k}`)
              .join(",")}`,
            Object.values(t),
          );
          if (t.building_id && t.typical_floor_rentable_pyeong != null)
            await db.query(
              "update buildings set typical_floor_rentable_pyeong=$2,typical_floor_exclusive_pyeong=$3,typical_floor_scope=$4,typical_floor_source_url=$5,typical_floor_source_period=$6,typical_floor_collected_at=$7 where id=$1",
              [
                t.building_id,
                t.typical_floor_rentable_pyeong,
                t.typical_floor_exclusive_pyeong,
                t.label + " 공시 기준층",
                t.source_url,
                t.source_period,
                t.collected_at,
              ],
            );
        }
      }
      assert.deepEqual(
        (
          await db.query(
            "select id,building_id,period,noc from leasing_quarters order by id",
          )
        ).rows,
        before,
        "NOC history must be untouched",
      );
      await db.query("commit");
    } catch (e) {
      await db.query("rollback");
      throw e;
    }
    console.log(
      "Applied:",
      collected.length,
      "complexes,",
      collected.reduce((s, g) => s + g.towers.length, 0),
      "towers; NOC unchanged",
    );
  }
} finally {
  await db.end();
}
