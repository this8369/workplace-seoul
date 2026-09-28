import { readFile, writeFile } from "node:fs/promises";
import {
  normalizeAddress,
  canonicalJibun,
} from "../db/address-normalization.mjs";
const read = async (path) => JSON.parse(await readFile(path, "utf8"));
const snapshot = await read("data/private/sheets-snapshot-20260928.json");
const codes = new Map(
  (await read("data/private/legal-dong-codes.json")).map((r) => [
    r.name,
    r.code,
  ]),
);
const cache = await read("data/private/geocoding-cache.json");
const parcels = new Map();
const skipped = [];
for (const b of snapshot.tables.buildings.rows.filter(
  (b) => process.argv.includes("--all-parcels") || b.status === "operating",
)) {
  const candidates = [b.standard_address, b.address]
    .filter(Boolean)
    .map((a) => normalizeAddress(a));
  let match;
  for (const address of candidates) {
    const found = address.match(/^(.*?)\s+(산\s*)?(\d+)(?:-(\d+))?(?:\s|$)/);
    if (!found || !codes.has(found[1])) continue;
    const code = codes.get(found[1]);
    match = {
      sigunguCd: code.slice(0, 5),
      bjdongCd: code.slice(5),
      platGbCd: found[2] ? "1" : "0",
      bun: found[3].padStart(4, "0"),
      ji: (found[4] || "0").padStart(4, "0"),
    };
    break;
  }
  if (!match)
    for (const address of candidates) {
      const found = cache[address]?.body?.addresses ?? [];
      if (found.length !== 1) continue;
      const canonical = canonicalJibun(found[0]);
      const m = canonical.match(/^(.*?)\s+(산\s*)?(\d+)(?:-(\d+))?$/);
      if (!m || !codes.has(m[1])) continue;
      const code = codes.get(m[1]);
      match = {
        sigunguCd: code.slice(0, 5),
        bjdongCd: code.slice(5),
        platGbCd: m[2] ? "1" : "0",
        bun: m[3].padStart(4, "0"),
        ji: (m[4] || "0").padStart(4, "0"),
      };
      break;
    }
  if (!match) {
    skipped.push({
      id: b.id,
      name: b.name,
      address: b.standard_address || b.address,
      reason: "법정동/지번 확정 필요",
    });
    continue;
  }
  const key = Object.values(match).join("-");
  if (!parcels.has(key)) parcels.set(key, { ...match, assets: [] });
  parcels.get(key).assets.push(b);
}
const plan = {
  created_at: new Date().toISOString(),
  code_source: "https://www.code.go.kr/etc/codeFullDown.do",
  parcels: [...parcels.values()],
  operations: ["getBrTitleInfo", "getBrRecapTitleInfo"],
  links: [],
  skipped,
};
await writeFile(
  process.argv.includes("--all-parcels")
    ? "data/private/all-asset-parcels.json"
    : "data/private/building-register-batch.json",
  JSON.stringify(plan, null, 2),
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    parcels: parcels.size,
    assets: plan.parcels.reduce((s, p) => s + p.assets.length, 0),
    skipped: skipped.length,
  }),
);
