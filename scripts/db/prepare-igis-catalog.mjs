// Public discovery plan, with private evidence. No funds/financials enter the projection.
import { readFile, writeFile } from "node:fs/promises";
import {
  normalizeAddress,
  canonicalJibun,
  canonicalRoad,
} from "./address-normalization.mjs";
const dir = "data/private/igis-master-20261006/";
const source = JSON.parse(
  await readFile(dir + "initial-import.json", "utf8"),
).tables;
const existing = JSON.parse(await readFile(dir + "existing-db.json", "utf8"))
  .records.buildings;
const keys = JSON.parse(await readFile("data/private/naver-maps.json", "utf8"));
const cache = JSON.parse(
  await readFile("data/private/geocoding-cache.json", "utf8"),
);
const normName = (v) =>
  String(v || "")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, "");
const normAddress = (v) =>
  normalizeAddress(v)
    .replace(/번지/g, "")
    .replace(/\s+(?:외|일원|소재).*$/, "")
    .trim();
const categories = {
  오피스: "office",
  오피스복합: "office",
  호텔: "hotel",
  호텔복합: "hotel",
  물류센터: "logistics",
  데이터센터: "data_center",
  리테일: "retail",
  리테일복합: "retail",
  주거: "residential",
  주거복합: "residential",
};
const reviewed = JSON.parse(
  await readFile(dir + "catalog-reviewed-links.json", "utf8").catch((e) => {
    if (e.code === "ENOENT") return "[]";
    throw e;
  }),
);
const rows = [],
  review = [],
  excluded = [];
const byId = new Map(existing.map((b) => [b.id, b]));
for (const o of source.master_investment_objects) {
  if (o.source_sold_flag !== false) {
    excluded.push({ id: o.id, reason: "sold_or_status_unknown" });
    continue;
  }
  if (!categories[o.underlying_sector] || !o.address_raw?.trim()) {
    review.push({
      id: o.id,
      name: o.name,
      reason: "physical_identity_or_address_unresolved",
    });
    continue;
  }
  const address = normAddress(o.address_raw),
    domestic = o.geographic_scope === "국내";
  let location = null;
  if (domestic && /\d/.test(address)) {
    if (!cache[address] && process.argv.includes("--geocode")) {
      try {
        const url = new URL(
          "https://maps.apigw.ntruss.com/map-geocode/v2/geocode",
        );
        url.search = new URLSearchParams({ query: address, count: "100" });
        const r = await fetch(url, {
          headers: {
            "x-ncp-apigw-api-key-id": keys.clientId,
            "x-ncp-apigw-api-key": keys.clientSecret,
          },
          signal: AbortSignal.timeout(12000),
        });
        if (!r.ok) throw Error("geocode HTTP " + r.status);
        const body = await r.json();
        if (body.status !== "OK") throw Error("geocode response");
        cache[address] = { body, fetchedAt: new Date().toISOString() };
      } catch {
        review.push({ id: o.id, name: o.name, reason: "geocode_unavailable" });
      }
    }
    const candidates = (cache[address]?.body?.addresses || []).filter((a) =>
      [canonicalJibun(a), canonicalRoad(a)].some(
        (v) => normAddress(v) === address,
      ),
    );
    if (new Set(candidates.map((a) => a.x + "," + a.y)).size === 1)
      location = candidates[0];
  }
  const addresses = new Set(
    [
      address,
      location && normAddress(canonicalJibun(location)),
      location && normAddress(canonicalRoad(location)),
    ].filter(Boolean),
  );
  const known = source.master_asset_links.find(
    (l) => l.object_id === o.id && l.status === "verified_source_evidence",
  );
  let building = known ? byId.get(known.existing_building_id) : null,
    method = known ? "previously_verified" : null;
  // Previously instructed redevelopment: Metro belongs to IOTA 8-1/6, never revive inactive Metro.
  if (o.name === "메트로타워" && address === "서울특별시 중구 퇴계로 10") {
    building = existing.find(
      (b) => b.status === "development" && /메트로타워 재개발/.test(b.name),
    );
    method = "user_confirmed_metro_iota_redevelopment";
  }
  const reviewedLink = reviewed.find(
    (r) => r.object_id === o.id && r.evidence?.trim(),
  );
  if (reviewedLink) {
    building = byId.get(reviewedLink.building_id);
    if (!building) throw Error("Reviewed building missing");
    method = reviewedLink.evidence;
  }
  if (!building) {
    const addressMatches = existing.filter((b) =>
      [b.address, b.standard_address, b.road_address].some(
        (v) => v && addresses.has(normAddress(v)),
      ),
    );
    const exact = addressMatches.filter((b) => {
      const name = normName(o.name),
        n = normName(b.name);
      return (
        (name.length >= 4 && n.includes(name)) ||
        (Number(o.gross_area_m2) > 0 &&
          Number(b.gross_area_m2) > 0 &&
          Math.abs(Number(o.gross_area_m2) - Number(b.gross_area_m2)) /
            Number(b.gross_area_m2) <
            0.003)
      );
    });
    if (exact.length === 1) {
      building = exact[0];
      method = "unique_exact_address_with_name_or_area";
    } else if (
      addressMatches.length ||
      source.master_asset_links.some(
        (l) => l.object_id === o.id && l.status === "candidate",
      )
    ) {
      review.push({
        id: o.id,
        name: o.name,
        reason: "existing_asset_match_requires_review",
        candidate_ids: addressMatches.map((b) => b.id),
      });
      continue;
    }
  }
  if (building && !["operating", "development"].includes(building.status)) {
    review.push({ id: o.id, name: o.name, reason: "inactive_existing_asset" });
    continue;
  }
  const category = categories[o.underlying_sector];
  const status = o.business_stage === "개발" ? "development" : "operating";
  const row = {
    object_id: o.id,
    source_row_id: o.source_row_id,
    building_id: building?.id || o.id,
    existing: !!building,
    category,
    method: method || "source_physical_property_identity",
    name: building?.name || o.name,
    address: building?.address || o.address_raw,
    standard_address:
      building?.standard_address ||
      (location ? canonicalJibun(location) : null),
    road_address:
      building?.road_address || (location ? canonicalRoad(location) : null),
    latitude: building?.latitude ?? (location ? Number(location.y) : null),
    longitude: building?.longitude ?? (location ? Number(location.x) : null),
    gross_area_m2:
      building?.gross_area_m2 ??
      (Number(o.gross_area_m2) > 0 ? o.gross_area_m2 : null),
    status: building?.status || status,
    country_code: domestic ? "KR" : null,
    source_as_of: o.source_exported_on,
    floors_above: o.floors_above,
    floors_below: o.floors_below,
    parking_spaces: o.parking_count,
  };
  // Multiple source positions can describe one asset; merge only exact address + name.
  const duplicate = rows.find(
    (r) =>
      normName(r.name) === normName(row.name) &&
      normAddress(r.address) === normAddress(row.address),
  );
  if (duplicate) {
    row.building_id = duplicate.building_id;
    row.existing = duplicate.existing;
    row.method = "same_source_name_and_address";
  }
  rows.push(row);
  if (rows.length % 30 === 0)
    console.log(
      JSON.stringify({ prepared: rows.length, review: review.length }),
    );
}
await writeFile("data/private/geocoding-cache.json", JSON.stringify(cache), {
  mode: 0o600,
});
await writeFile(
  dir + "catalog-plan.json",
  JSON.stringify(
    { created_at: new Date().toISOString(), rows, review, excluded },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    rows: rows.length,
    assets: new Set(rows.map((r) => r.building_id)).size,
    existing: rows.filter((r) => r.existing).length,
    located: rows.filter((r) => r.latitude != null).length,
    review: review.length,
    excluded: excluded.length,
  }),
);
