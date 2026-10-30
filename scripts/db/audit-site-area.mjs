import { mkdir, writeFile } from "node:fs/promises";
import { connectDatabase } from "../building-register/vworld-client.mjs";

const db = await connectDatabase();
try {
  await db.query("set statement_timeout='20s'");
  const buildings = (
    await db.query(`select b.id,b.name,b.status,b.complex_scope,b.complex_id,c.representative_building_id,p.site_area_m2
    from buildings b left join building_complexes c on c.id=b.complex_id and c.published
    left join building_asset_profiles p on p.id=b.id where public.is_public_detail_asset(b.id)`)
  ).rows;
  const facts = (
    await db.query(
      "select id,site_area_m2 from detail_building_register_overview",
    )
  ).rows;
  const parcels = (
    await db.query(`select building_id,count(*)::int parcels,count(*) filter(where area_m2>0)::int with_area,sum(area_m2) area_m2
    from building_parcels where verified group by building_id`)
  ).rows;
  const report = buildings.map((b) => {
    const source = buildings.find(
      (x) => x.id === (b.representative_building_id || b.id),
    );
    const site =
      source?.site_area_m2 ??
      facts.find((f) => f.id === source?.id)?.site_area_m2 ??
      null;
    return {
      ...b,
      displayed_site_area_m2: site,
      parcels: parcels.find((p) => p.building_id === b.id),
    };
  });
  await mkdir("data/private/asset-overview", { recursive: true });
  await writeFile(
    "data/private/asset-overview/site-area-audit.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        total: report.length,
        visible: report.filter((b) => Number(b.displayed_site_area_m2) > 0)
          .length,
        operatingMissing: report.filter(
          (b) => b.status === "operating" && !Number(b.displayed_site_area_m2),
        ).length,
        missingWithParcel: report.filter(
          (b) =>
            b.status === "operating" &&
            !Number(b.displayed_site_area_m2) &&
            b.parcels?.with_area > 0,
        ).length,
      },
      null,
      2,
    ),
  );
} finally {
  await db.end();
}
