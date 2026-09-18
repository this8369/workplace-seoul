import pg from "pg";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const folder = "data/private/images";
await mkdir(folder, { recursive: true });
const config = JSON.parse(
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
const buildings = (
  await db.query(
    "select id,name,address,standard_address,road_address,latitude,longitude,status from buildings where status='operating' order by name",
  )
).rows;
await db.end();
await writeFile(`${folder}/buildings.json`, JSON.stringify(buildings));
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, "");
const aliases = (b) => {
  const base = b.name.split(/[<(（]/)[0].trim();
  const names = [
    base,
    ...[...b.name.matchAll(/\((?:구[,.,\s]*)?([^)]*)\)/g)].map((x) =>
      x[1].trim(),
    ),
  ];
  const extra = names.flatMap((n) => [
    n.replace(/\s+[A-Za-z].*$/, ""),
    n.replace(/^[A-Za-z0-9 &'.-]+\s+(?=[가-힣])/, ""),
    n.replace(/<[^>]*>|\s*[ABCDNESW]동$/g, "").trim(),
  ]);
  return [...new Set([...names, ...extra])].filter((x) => x.length > 2);
};
const distance = (b, x) =>
  Math.hypot(
    (Number(b.latitude) - Number(x.lat)) * 111000,
    (Number(b.longitude) - Number(x.lng)) * 88000,
  );
const road = (s) =>
  norm(s)
    .replace(/^서울특별시|^서울시|^서울/, "서울")
    .replace(/^경기도|^경기/, "경기");
let cache = {};
try {
  cache = JSON.parse(await readFile(`${folder}/collection.json`, "utf8"));
} catch {}
let stop = false,
  done = 0;
async function get(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if ([401, 403, 429].includes(r.status)) {
    stop = true;
    throw Error(`access-${r.status}`);
  }
  if (!r.ok) throw Error(`HTTP ${r.status}`);
  return r;
}
for (const b of buildings) {
  if (stop) break;
  if (cache[b.id]?.image_file) {
    done++;
    continue;
  }
  try {
    let match;
    for (const q of aliases(b).slice(0, 6)) {
      const url = new URL("https://officefind.co.kr/getOfficeData");
      url.search = new URLSearchParams({
        getType: "office",
        page: "1",
        search_str: q,
        searchSeo: "",
        search_area: "",
      });
      const result = await (await get(url)).json();
      const candidates = (result.data || []).filter((x) => {
        const name = norm(x.M_NM);
        const nameMatch = aliases(b).some(
          (a) =>
            norm(a) === name ||
            (Math.min(norm(a).length, name.length) >= 4 &&
              (norm(a).includes(name) || name.includes(norm(a)))),
        );
        const locationMatch =
          (b.latitude && b.longitude && distance(b, x) < 160) ||
          (!!b.road_address && road(b.road_address) === road(x.addr));
        return nameMatch && locationMatch;
      });
      if (candidates.length === 1) {
        match = candidates[0];
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    if (!match) {
      cache[b.id] = { building_id: b.id, name: b.name, status: "unmatched" };
      continue;
    }
    const detailUrl = `https://officefind.co.kr/get/office-detail?gubun=bd&office_id=${encodeURIComponent(match.bd_id)}`;
    const detail = await (await get(detailUrl)).json();
    const photos = [
      ...String(detail.html || "").matchAll(
        /<img[^>]*src=["']([^"']+)["'][^>]*alt=["']([^"']*)/g,
      ),
    ].filter(
      (x) =>
        x[1].includes("/v2_bd_img/") &&
        x[1].includes("480x360") &&
        x[2].includes("사진"),
    );
    if (!photos.length) {
      cache[b.id] = { building_id: b.id, name: b.name, status: "no-photo" };
      continue;
    }
    const imageUrl = new URL(photos[0][1], "https://officefind.co.kr").href;
    const response = await get(imageUrl);
    if (!response.headers.get("content-type")?.startsWith("image/"))
      throw Error("not-image");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 12000000) throw Error("oversized");
    const file = `${folder}/${b.id}.source`;
    await writeFile(file, bytes);
    cache[b.id] = {
      building_id: b.id,
      name: b.name,
      title: `${match.M_NM} 외관`,
      source_name: "오피스파인드",
      source_url:
        detail.meta?.canonical ||
        new URL(detail.seo_url, "https://officefind.co.kr").href,
      source_image_url: imageUrl,
      source_date: new Date().toISOString().slice(0, 10),
      source_address: match.addr,
      image_file: file,
      source_bytes: bytes.length,
      review_note: `건물명·위치 대조: ${match.M_NM} / ${match.addr}. 원본에 포함된 표기 유지. 촬영일 미확인.`,
      status: "matched",
    };
    done++;
    if (done % 10 === 0) console.log(`Collected ${done}/${buildings.length}`);
  } catch (e) {
    cache[b.id] = {
      building_id: b.id,
      name: b.name,
      status: "error",
      error: e.message,
    };
  } finally {
    await writeFile(
      `${folder}/collection.json`,
      JSON.stringify(cache, null, 2),
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
}
console.log(
  JSON.stringify({
    total: buildings.length,
    collected: done,
    stopped: stop,
    unmatched: Object.values(cache).filter((x) => x.status === "unmatched")
      .length,
  }),
);
