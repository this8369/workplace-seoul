import { readFile, writeFile } from "node:fs/promises";
import { normalizeAddress } from "../db/address-normalization.mjs";
const root = "data/private/igis-master-20261006/";
const rows = JSON.parse(
  await readFile(root + "catalog-plan.json", "utf8"),
).rows;
const codes = new Map(
  JSON.parse(await readFile("data/private/legal-dong-codes.json", "utf8")).map(
    (r) => [r.name, r.code],
  ),
);
const parcels = new Map(),
  skipped = [];
for (const b of [...new Map(rows.map((r) => [r.building_id, r])).values()]) {
  if (b.country_code !== "KR") continue;
  const address = normalizeAddress(b.standard_address || b.address).replace(
    /번지/g,
    "",
  );
  const m = address.match(/^(.*?)\s+(산\s*)?(\d+)(?:-(\d+))?(?:\s|$)/);
  if (!m || !codes.has(m[1])) {
    skipped.push({ id: b.building_id, reason: "legal_lot_unresolved" });
    continue;
  }
  const c = codes.get(m[1]),
    p = {
      sigunguCd: c.slice(0, 5),
      bjdongCd: c.slice(5),
      platGbCd: m[2] ? "1" : "0",
      bun: m[3].padStart(4, "0"),
      ji: (m[4] || "0").padStart(4, "0"),
    },
    key = Object.values(p).join("-");
  if (!parcels.has(key)) parcels.set(key, { ...p, assets: [] });
  parcels.get(key).assets.push({ ...b, id: b.building_id });
}
const all = [...parcels.values()];
await writeFile(
  root + "land-plan.json",
  JSON.stringify({ parcels: all, skipped }, null, 2),
  { mode: 0o600 },
);
const plan = {
  parcels: all
    .map((p) => ({
      ...p,
      assets: p.assets.filter((b) => b.status === "operating" && !b.existing),
    }))
    .filter((p) => p.assets.length),
  operations: ["getBrTitleInfo", "getBrRecapTitleInfo"],
  links: [],
  skipped,
};
await writeFile(root + "register-plan.json", JSON.stringify(plan, null, 2), {
  mode: 0o600,
});
console.log(
  JSON.stringify({
    land_parcels: all.length,
    register_parcels: plan.parcels.length,
    unresolved: skipped.length,
  }),
);
