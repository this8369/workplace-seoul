// Run after a fresh bounded native Sheet read is saved to the ignored input file.
// Dry run enriches addresses and creates an inspectable report. --apply updates DB only.
import pg from "pg";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  normalizeAddress,
  exactAddressMatch,
  canonicalJibun,
  canonicalRoad,
} from "./address-normalization.mjs";
const dir = "data/private/";
const read = async (name) => JSON.parse(await readFile(dir + name, "utf8"));
const inputs = await read("address-source.json"),
  keys = await read("naver-maps.json");
let cache = {};
try {
  cache = await read("geocoding-cache.json");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const report = [],
  seen = new Set();
for (const input of inputs) {
  const { kind, side, id, row, source } = input;
  if (
    !["building", "transaction", "movement"].includes(kind) ||
    !["address", "from", "to"].includes(side) ||
    typeof source !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(id) ||
    !Number.isInteger(row) ||
    row < 1
  )
    throw new Error("Invalid address input");
  if (seen.has(`${kind}:${side}:${id}`))
    throw new Error("Duplicate address input");
  seen.add(`${kind}:${side}:${id}`);
  const query = normalizeAddress(source, kind === "transaction");
  if (query && !cache[query]) {
    const url = new URL("https://maps.apigw.ntruss.com/map-geocode/v2/geocode");
    url.searchParams.set("query", query);
    url.searchParams.set("count", "100");
    const response = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      headers: {
        "x-ncp-apigw-api-key-id": keys.clientId,
        "x-ncp-apigw-api-key": keys.clientSecret,
      },
    });
    if (!response.ok) throw new Error("Geocoding HTTP " + response.status);
    const body = await response.json();
    if (body.status !== "OK") throw new Error("Geocoding rejected");
    cache[query] = { body, fetchedAt: new Date().toISOString() };
    await writeFile(dir + "geocoding-cache.json", JSON.stringify(cache), {
      mode: 0o600,
    });
  }
  const match = exactAddressMatch(query, cache[query]?.body.addresses || []);
  report.push({
    kind,
    side,
    id,
    row,
    source,
    standard: match ? canonicalJibun(match) : query,
    road: match ? canonicalRoad(match) : "",
    latitude: match ? Number(match.y) : null,
    longitude: match ? Number(match.x) : null,
    status: match ? "exact" : "needs_review",
    checkedAt: cache[query]?.fetchedAt || null,
  });
}
await writeFile(dir + "address-report.json", JSON.stringify(report, null, 2), {
  mode: 0o600,
});
for (const kind of ["building", "transaction", "movement"])
  console.log(
    kind,
    JSON.stringify({
      total: report.filter((r) => r.kind === kind).length,
      exact: report.filter((r) => r.kind === kind && r.status === "exact")
        .length,
    }),
  );
if (process.argv.includes("--apply")) {
  const { reviewerEmail, ...connection } = await read("db-config.json");
  const db = new pg.Client({
    ...connection,
    password: (await readFile(dir + "db-password", "utf8")).trim(),
    ssl: {
      rejectUnauthorized: true,
      ca: await readFile(dir + "supabase-ca.crt", "utf8"),
    },
    connectionTimeoutMillis: 15000,
  });
  try {
    await db.connect();
    await db.query("begin");
    const payload = JSON.stringify({
      provider: "NAVER Maps Geocoding",
      method: "Exact lot match; no building identity or entrance verification",
      report,
    });
    await db.query(
      "insert into private.source_snapshots(id,source_id,payload) values($1,$2,$3) on conflict(id) do nothing",
      [
        "address:" + createHash("sha256").update(payload).digest("hex"),
        "naver-maps-geocoding",
        payload,
      ],
    );
    for (const r of report) {
      let result;
      if (r.kind === "building")
        result = await db.query(
          `update public.buildings set standard_address=$1,road_address=$2,address_status=$3,address_checked_at=$4,address_provider='NAVER Maps Geocoding',latitude=coalesce(latitude,$5),longitude=coalesce(longitude,$6) where id=$7 and address=$8 and ((latitude is null and longitude is null) or (latitude=$5 and longitude=$6))`,
          [
            r.standard,
            r.road || null,
            r.status,
            r.checkedAt,
            r.latitude,
            r.longitude,
            r.id,
            r.source,
          ],
        );
      else if (r.kind === "transaction")
        result = await db.query(
          "update public.transactions set source_address=$1,standard_address=$2,road_address=$3,address_status=$4 where id=$5 and (source_address is null or source_address=$1)",
          [r.source, r.standard, r.road || null, r.status, r.id],
        );
      else {
        const prefix = r.side === "from" ? "from" : "to";
        result = await db.query(
          `update public.tenant_movements set ${prefix}_source_address=$1,${prefix}_standard_address=$2 where id=$3 and (${prefix}_source_address is null or ${prefix}_source_address=$1)`,
          [r.source, r.standard, r.id],
        );
      }
      if (result.rowCount !== 1)
        throw new Error(
          "Concurrent change or unknown row: " + r.kind + " " + r.id,
        );
    }
    await db.query("commit");
    console.log(
      "Applied",
      report.length,
      "address records. Publication/reviewer state preserved.",
    );
  } catch (e) {
    await db.query("rollback").catch(() => {});
    throw e;
  } finally {
    await db.end();
  }
}
