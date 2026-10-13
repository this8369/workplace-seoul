import { readFile } from "node:fs/promises";
import { connectDatabase } from "../building-register/vworld-client.mjs";
const rows = JSON.parse(
    await readFile("data/private/asset-overview/seoul-parks.json", "utf8"),
  ),
  db = await connectDatabase();
try {
  await db.query("begin");
  for (const r of rows)
    await db.query(
      `insert into public.asset_green_spaces(name,address,area_m2,latitude,longitude,source_name,source_url,source_row,as_of) values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(source_url,source_row,as_of) do nothing`,
      [
        r.name,
        r.address,
        r.area_m2,
        r.latitude,
        r.longitude,
        r.source_name,
        r.source_url,
        r.source_row,
        r.as_of,
      ],
    );
  await db.query("commit");
  console.log(
    JSON.stringify(
      (
        await db.query(
          "select count(*)::int connections,count(distinct building_id)::int buildings from public.building_green_spaces",
        )
      ).rows[0],
    ),
  );
} catch (e) {
  await db.query("rollback");
  throw e;
} finally {
  await db.end();
}
