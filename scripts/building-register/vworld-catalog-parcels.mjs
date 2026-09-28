import { readFile } from "node:fs/promises";
import { connectDatabase, vworldClient } from "./vworld-client.mjs";
import { parcelPolygons } from "../../src/lib/parcel-geometry.ts";
const db = await connectDatabase(),
  request = await vworldClient(),
  apply = process.argv.includes("--apply");
const plan = JSON.parse(
  await readFile("data/private/all-asset-parcels.json", "utf8"),
);
const codes = new Map(
  JSON.parse(await readFile("data/private/legal-dong-codes.json", "utf8")).map(
    (r) => [r.code, r.name],
  ),
);
let added = 0,
  missing = 0;
try {
  for (const p of plan.parcels) {
    const pnu =
      p.sigunguCd +
      p.bjdongCd +
      (p.platGbCd === "1" ? "2" : "1") +
      p.bun +
      p.ji;
    const ids = p.assets.map((a) => a.id);
    const existing = (
      await db.query(
        "select building_id from building_parcels where pnu=$1 and building_id=any($2::uuid[])",
        [pnu, ids],
      )
    ).rows.map((r) => r.building_id);
    const pending = ids.filter((id) => !existing.includes(id));
    if (!pending.length) continue;
    const body = await request(
      "/req/data",
      {
        service: "data",
        request: "GetFeature",
        version: "2.0",
        data: "LP_PA_CBND_BUBUN",
        attrFilter: `pnu:=:${pnu}`,
        format: "json",
        crs: "EPSG:4326",
        size: "1000",
      },
      `${pnu}-catalog-geometry`,
    );
    if (body.response?.status === "NOT_FOUND") {
      missing += pending.length;
      continue;
    }
    if (body.response?.status !== "OK")
      throw new Error("Invalid parcel response");
    const features = body.response.result?.featureCollection?.features ?? [];
    if (features.some((f) => String(f.properties?.pnu) !== pnu))
      throw new Error("Parcel identity mismatch");
    const polygons = features.flatMap((f) => parcelPolygons(f.geometry));
    if (!polygons.length) {
      missing += pending.length;
      continue;
    }
    const geometry =
      polygons.length === 1
        ? { type: "Polygon", coordinates: polygons[0] }
        : { type: "MultiPolygon", coordinates: polygons };
    const address = `${codes.get(p.sigunguCd + p.bjdongCd)} ${p.platGbCd === "1" ? "산 " : ""}${Number(p.bun)}${Number(p.ji) ? "-" + Number(p.ji) : ""}`;
    for (const id of pending) {
      if (apply)
        await db.query(
          `insert into building_parcels(building_id,pnu,address,is_primary,geometry,source_name,source_url,verified) values($1,$2,$3,true,$4,'자산 등록주소 · VWorld 연속지적도','https://www.vworld.kr/dev/v4dv_2ddataguide2_s002.do?svcIde=cadastral',true) on conflict(building_id,pnu) do nothing`,
          [id, pnu, address, JSON.stringify(geometry)],
        );
      added++;
    }
  }
  console.log(JSON.stringify({ apply, added, missing }));
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
