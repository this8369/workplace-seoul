// Public pages only, one request at a time. Cache/checkpoint every asset and stop
// on access challenges; never rotate accounts, IPs, or bypass rate limits.
import pg from "pg";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { aliases, norm, parseOffice, identityMatch } from "./parser.mjs";
const root = "data/private/officefind";
await mkdir(`${root}/pages`, { recursive: true });
const read = async (p, fallback) => {
  try {
    return JSON.parse(await readFile(p, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return fallback;
    throw e;
  }
};
const { reviewerEmail, ...config } = await read("data/private/db-config.json");
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
const buildings = (
  await db.query(
    "select id,name,address,standard_address,road_address,latitude,longitude,status,gross_area_m2,typical_floor_rentable_pyeong,typical_floor_exclusive_pyeong from buildings order by name",
  )
).rows;
const photos = await read("data/private/images/collection.json", {});
const cache = await read(`${root}/results.json`, {});
let requests = 0,
  lastRequest = 0,
  stopped = false;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hash = (s) => createHash("sha256").update(s).digest("hex");
async function request(url) {
  const parsed = new URL(url);
  if (
    parsed.origin !== "https://officefind.co.kr" ||
    parsed.pathname.startsWith("/propertyISsystem")
  )
    throw Error("outside-public-scope");
  url = parsed.href;
  const path = `${root}/pages/${hash(url)}.json`;
  const saved = await read(path, null);
  if (saved) return saved;
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleep(Math.max(0, lastRequest + 2200 - Date.now()));
    lastRequest = Date.now();
    requests++;
    let response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(20000),
        redirect: "error",
        headers: {
          "User-Agent":
            "WorkplaceSeoul-DataImport/1.0 (public building specifications)",
        },
      });
    } catch (e) {
      if (attempt === 2) throw e;
      await sleep(5000 * (attempt + 1));
      continue;
    }
    if ([401, 403, 429].includes(response.status)) {
      stopped = true;
      throw Error(
        `source-access-${response.status}${response.headers.get("retry-after") ? " retry-after " + response.headers.get("retry-after") : ""}`,
      );
    }
    if (response.status >= 500 && attempt < 2) {
      await sleep(5000 * (attempt + 1));
      continue;
    }
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    const text = await response.text();
    if (
      /cf-chl-|verify you are human|access denied|captcha challenge/i.test(text)
    ) {
      stopped = true;
      throw Error("source-access-challenge");
    }
    const result = {
      url,
      fetched_at: new Date().toISOString(),
      text,
      hash: hash(text),
    };
    await writeFile(path, JSON.stringify(result));
    return result;
  }
  throw Error("request-failed");
}
let sitemap;
try {
  sitemap = await readFile(`${root}/sitemap.xml`, "utf8");
} catch {
  sitemap = (await request("https://officefind.co.kr/sitemap.xml")).text;
  await writeFile(`${root}/sitemap.xml`, sitemap);
}
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((m) => m[1].replaceAll("&amp;", "&"))
  .filter((s) => s.startsWith("https://officefind.co.kr/"))
  .map((url) => ({
    url,
    slug: decodeURIComponent(new URL(url).pathname.slice(1)),
  }));
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function candidates(b) {
  const lot = (b.standard_address || b.address).match(
    /(\S+(?:동|가))\s+(\d+(?:-\d+)?)(?:\s|$)/,
  );
  const addressRegex = lot
    ? new RegExp("^" + escape(lot[1] + lot[2]) + "(?=[^0-9-]|$)")
    : null;
  const matches = urls.filter((x) => addressRegex?.test(x.slug));
  const names = aliases(b).map(norm);
  const byName = urls.filter((x) =>
    names.some((n) => n.length >= 4 && norm(x.slug).includes(n)),
  );
  return [
    ...new Set(
      [
        photos[b.id]?.source_url,
        ...matches.map((x) => x.url),
        ...byName.map((x) => x.url),
      ].filter((u) => u?.startsWith("https://officefind.co.kr/")),
    ),
  ].slice(0, 6);
}
async function search(b) {
  const names = aliases(b);
  const terms = [names[0], b.road_address || names[1]].filter(Boolean);
  const found = [];
  for (const term of [...new Set(terms)]) {
    const url = new URL("https://officefind.co.kr/getOfficeData");
    url.search = new URLSearchParams({
      getType: "office",
      page: "1",
      search_str: term,
      searchSeo: "",
      search_area: "",
    });
    const body = JSON.parse((await request(url.href)).text);
    if (Array.isArray(body) && body.length === 0) continue;
    if (!Array.isArray(body.data)) throw Error("unexpected-search-response");
    for (const row of body.data) {
      const source = {
        name: row.M_NM,
        address: row.addr,
        latitude: +row.lat,
        longitude: +row.lng,
      };
      if (
        (identityMatch(b, source, buildings).ok ||
          (!source.address?.trim() &&
            aliases(b).some(
              (a) =>
                norm(row.M_NM).includes(norm(a)) ||
                norm(a).includes(norm(row.M_NM)),
            ))) &&
        row.seo_url
      )
        found.push(new URL(row.seo_url, "https://officefind.co.kr/").href);
    }
    if (found.length) break;
  }
  return [...new Set(found)].slice(0, 4);
}
const summary = () =>
  Object.values(cache).reduce((s, r) => {
    s[r.status] = (s[r.status] || 0) + 1;
    return s;
  }, {});
async function persist(b, record) {
  await db.query("begin");
  try {
    if (record.status === "matched") {
      const current = (
        await db.query(
          "select typical_floor_rentable_pyeong,typical_floor_exclusive_pyeong,typical_floor_source_url from buildings where id=$1 for update",
          [b.id],
        )
      ).rows[0];
      if (
        (current.typical_floor_source_url &&
          current.typical_floor_source_url !== record.source_url) ||
        [
          ["typical_floor_rentable_pyeong", "rentable_pyeong"],
          ["typical_floor_exclusive_pyeong", "exclusive_pyeong"],
        ].some(
          ([dbKey, k]) =>
            current[dbKey] != null &&
            record[k] != null &&
            Math.abs(Number(current[dbKey]) - record[k]) > 0.0001,
        )
      )
        record.status = "existing-value-conflict";
      else
        await db.query(
          `update buildings set typical_floor_rentable_pyeong=coalesce(typical_floor_rentable_pyeong,$2),typical_floor_exclusive_pyeong=coalesce(typical_floor_exclusive_pyeong,$3),typical_floor_source_url=$4,typical_floor_source_period=$5,typical_floor_collected_at=$6 where id=$1`,
          [
            b.id,
            record.rentable_pyeong,
            record.exclusive_pyeong,
            record.source_url,
            record.source_period || null,
            record.observed_at,
          ],
        );
    }
    await db.query(
      `insert into private.officefind_floor_imports(building_id,status,source_url,source_name,source_address,rentable_pyeong,exclusive_pyeong,source_period,raw_floor,match_reason,content_hash,observed_at,audit) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) on conflict(building_id) do update set status=excluded.status,source_url=excluded.source_url,source_name=excluded.source_name,source_address=excluded.source_address,rentable_pyeong=excluded.rentable_pyeong,exclusive_pyeong=excluded.exclusive_pyeong,source_period=excluded.source_period,raw_floor=excluded.raw_floor,match_reason=excluded.match_reason,content_hash=excluded.content_hash,observed_at=excluded.observed_at,audit=excluded.audit`,
      [
        b.id,
        record.status,
        record.source_url || null,
        record.source_name || null,
        record.source_address || null,
        record.rentable_pyeong ?? null,
        record.exclusive_pyeong ?? null,
        record.source_period || null,
        record.raw_floor || null,
        record.match_reason || null,
        record.content_hash || null,
        record.observed_at,
        JSON.stringify({
          attempts: record.attempts,
          warnings: record.warnings,
          error: record.error,
        }),
      ],
    );
    await db.query("commit");
    cache[b.id] = { building_id: b.id, name: b.name, ...record };
    await writeFile(`${root}/results.json`, JSON.stringify(cache, null, 2));
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}
try {
  const ordered = [...buildings].sort(
    (a, b) =>
      Number(Boolean(photos[b.id]?.source_url)) -
      Number(Boolean(photos[a.id]?.source_url)),
  );
  for (const [index, b] of ordered.entries()) {
    if (stopped) break;
    if (cache[b.id] && !["error", "blocked"].includes(cache[b.id].status))
      continue;
    const attempts = [];
    let chosen = null;
    try {
      const initial = candidates(b);
      const checked = new Set();
      const inspect = async (links) => {
        for (const url of links) {
          if (checked.has(url)) continue;
          checked.add(url);
          let page;
          try {
            page = await request(url);
          } catch (e) {
            if (stopped) throw e;
            attempts.push({ url, error: e.message });
            continue;
          }
          const spec = parseOffice(page.text, page.url);
          const match = identityMatch(b, spec, buildings);
          attempts.push({
            url: page.url,
            name: spec.name,
            address: spec.address,
            reason: match.reason,
          });
          if (!match.ok) continue;
          if (
            b.status === "development" &&
            match.reason !== "name-and-address"
          ) {
            attempts.at(-1).reason = "development-identity-unconfirmed";
            continue;
          }
          chosen = {
            status: spec.warnings.length
              ? "source-value-conflict"
              : spec.rentable_pyeong != null || spec.exclusive_pyeong != null
                ? "matched"
                : "source-missing",
            source_url: page.url,
            source_name: spec.name,
            source_address: spec.address,
            rentable_pyeong: spec.rentable_pyeong,
            exclusive_pyeong: spec.exclusive_pyeong,
            source_period: spec.period,
            raw_floor: spec.raw_floor,
            warnings: spec.warnings,
            content_hash: page.hash,
            observed_at: page.fetched_at,
            match_reason: match.reason,
          };
          return;
        }
      };
      await inspect(initial);
      if (!chosen && !stopped) await inspect(await search(b));
      await persist(b, {
        ...(chosen || {
          status: attempts.some(
            (a) => a.reason === "tower-or-stratum-ambiguous",
          )
            ? "ambiguous"
            : "unmatched",
          observed_at: new Date().toISOString(),
        }),
        attempts,
      });
    } catch (e) {
      await persist(b, {
        status: stopped ? "blocked" : "error",
        error: e.message,
        attempts,
        observed_at: new Date().toISOString(),
      });
      if (stopped) console.log("Source requested stop:", e.message);
    }
    if ((index + 1) % 10 === 0)
      console.log(
        JSON.stringify({
          processed: Object.keys(cache).length,
          total: buildings.length,
          requests,
          ...summary(),
        }),
      );
  }
  const stats = (
    await db.query(
      `select count(*)::int total,count(*) filter(where typical_floor_rentable_pyeong is not null)::int rentable,count(*) filter(where typical_floor_exclusive_pyeong is not null)::int exclusive,count(*) filter(where typical_floor_rentable_pyeong is not null and typical_floor_exclusive_pyeong is not null)::int both from buildings`,
    )
  ).rows[0];
  const report = {
    finished_at: new Date().toISOString(),
    stopped,
    requests,
    total: buildings.length,
    processed: Object.keys(cache).length,
    statuses: summary(),
    database: stats,
  };
  await writeFile(`${root}/summary.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await db.end();
}
