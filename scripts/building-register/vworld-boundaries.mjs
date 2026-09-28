import pg from "pg";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parcelPolygons } from "../../src/lib/parcel-geometry.ts";
const key = (
  process.env.VWORLD_KEY || (await readFile("data/private/vworld-key", "utf8"))
).trim();
const domain = (
  process.env.VWORLD_DOMAIN ||
  (await readFile("data/private/vworld-domain", "utf8"))
).trim();
if (!key || !/^https?:\/\//.test(domain))
  throw new Error("VWorld key and registered domain are required");
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
const apply = process.argv.includes("--apply");
await mkdir("data/private/vworld", { recursive: true, mode: 0o700 });
let fetched = 0,
  empty = 0,
  updated = 0;
try {
  await db.connect();
  const parcels = (
    await db.query(
      "select distinct pnu from building_parcels where verified order by pnu",
    )
  ).rows;
  for (const { pnu } of parcels) {
    if (!/^\d{19}$/.test(pnu)) throw new Error("Invalid PNU");
    const file = `data/private/vworld/${pnu}-geometry.json`;
    let capture;
    try {
      capture = JSON.parse(await readFile(file, "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    if (!capture || Date.now() - Date.parse(capture.collected_at) > 86400000) {
      const url = new URL("https://api.vworld.kr/req/data");
      url.search = new URLSearchParams({
        service: "data",
        request: "GetFeature",
        version: "2.0",
        data: "LP_PA_CBND_BUBUN",
        key,
        domain,
        attrFilter: `pnu:=:${pnu}`,
        format: "json",
        crs: "EPSG:4326",
        size: "1000",
      }).toString();
      let response;
      try {
        response = await fetch(url, {
          signal: AbortSignal.timeout(30000),
          redirect: "error",
        });
      } catch {
        throw new Error("VWorld connection failed (credentials omitted)");
      }
      if (!response.ok) throw new Error(`VWorld HTTP ${response.status}`);
      const raw = await response.text();
      let result;
      try {
        result = JSON.parse(
          raw.replace(/("pnu"\s*:\s*)(\d{19})(?=\s*[,}])/g, '$1"$2"'),
        ).response;
      } catch {
        throw new Error("Invalid VWorld JSON response");
      }
      if (!["OK", "NOT_FOUND"].includes(result?.status))
        throw new Error(
          `VWorld API ${String(result?.error?.code ?? "failed").replace(/[^A-Z0-9_]/gi, "")}`,
        );
      const features = result.result?.featureCollection?.features ?? [];
      if (features.some((f) => String(f.properties?.pnu) !== pnu))
        throw new Error("Returned parcel identity mismatch");
      capture = { pnu, collected_at: new Date().toISOString(), features };
      await writeFile(file, JSON.stringify(capture), { mode: 0o600 });
      fetched++;
      await new Promise((r) => setTimeout(r, 200));
    }
    const polygons = capture.features.flatMap((f) =>
      parcelPolygons(f.geometry),
    );
    if (!polygons.length) {
      empty++;
      continue;
    }
    const geometry =
      polygons.length === 1
        ? { type: "Polygon", coordinates: polygons[0] }
        : { type: "MultiPolygon", coordinates: polygons };
    if (apply)
      updated += (
        await db.query(
          `update building_parcels set geometry=$1,source_name='국토교통부 건축물대장 · VWorld 연속지적도',source_url='https://www.vworld.kr/dev/v4dv_2ddataguide2_s002.do?svcIde=cadastral',collected_at=$2 where pnu=$3 and verified`,
          [JSON.stringify(geometry), capture.collected_at, pnu],
        )
      ).rowCount;
  }
  console.log(JSON.stringify({ apply, fetched, empty, updated }));
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
