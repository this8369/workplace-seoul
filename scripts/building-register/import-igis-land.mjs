import { readFile } from "node:fs/promises";
import { connectDatabase } from "./vworld-client.mjs";
const plan = JSON.parse(
  await readFile("data/private/igis-master-20261006/land-plan.json", "utf8"),
);
const db = await connectDatabase(),
  apply = process.argv.includes("--apply");
let added = 0;
try {
  await db.query("begin");
  for (const p of plan.parcels)
    for (const b of p.assets) {
      // Existing reviewed parcel bundles (including redevelopment unions) are authoritative.
      if (
        (
          await db.query(
            "select 1 from building_parcels where building_id=$1 limit 1",
            [b.id],
          )
        ).rowCount
      )
        continue;
      if (
        !(
          await db.query(
            "select 1 from private.igis_catalog_publications where building_id=$1",
            [b.id],
          )
        ).rowCount
      )
        throw Error("Unapproved building");
      const pnu =
        p.sigunguCd +
        p.bjdongCd +
        (p.platGbCd === "1" ? "2" : "1") +
        p.bun +
        p.ji;
      const r = await db.query(
        `insert into building_parcels(building_id,pnu,address,is_primary,source_name,source_url,as_of,verified) values($1,$2,$3,true,'IGIS 자산 원본 대표지번 · 행정표준 법정동코드','https://www.code.go.kr/', $4,true) on conflict(building_id,pnu) do nothing`,
        [b.id, pnu, b.standard_address || b.address, b.source_as_of],
      );
      added += r.rowCount;
    }
  await db.query(apply ? "commit" : "rollback");
  console.log(JSON.stringify({ applied: apply, added }));
} catch (e) {
  await db.query("rollback");
  throw e;
} finally {
  await db.end();
}
