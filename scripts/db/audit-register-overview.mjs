import { mkdir, writeFile } from "node:fs/promises";
import { connectDatabase } from "../building-register/vworld-client.mjs";
const db = await connectDatabase();
try {
  const { rows: buildings } = await db.query(
    `select b.id,b.name,public.is_public_detail_asset(b.id) public_detail,b.status,b.gross_area_m2,b.floors_above,b.floors_below,b.completion_year,b.usage_approved_on,b.parking_spaces,b.complex_id,b.complex_scope,b.component_source_building_id,c.representative_building_id,c.parking_spaces complex_parking_spaces,p.site_area_m2,p.floor_area_ratio,p.efficiency_pct,p.office_area_m2,p.retail_area_m2 from buildings b left join building_complexes c on c.id=b.complex_id left join building_asset_profiles p on p.id=b.id order by b.name`,
  );
  const { rows: links } = await db.query(
    `select l.building_id,l.tower_id,l.evidence,r.* from building_register_links l join building_register_records r on r.id=l.record_id where l.status='verified' and r.is_current`,
  );
  const { rows: fields } = await db.query(
    "select column_name from information_schema.columns where table_schema='public' and table_name='building_register_records' order by ordinal_position",
  );
  const summary = {
    assets: buildings.length,
    publicAssets: buildings.filter((b) => b.public_detail).length,
    verifiedCurrentLinks: links.length,
    linkedBuildings: new Set(links.map((r) => r.building_id)).size,
    existingMissing: Object.fromEntries(
      [
        "site_area_m2",
        "floor_area_ratio",
        "floors_above",
        "floors_below",
        "parking_spaces",
        "gross_area_m2",
        "office_area_m2",
        "retail_area_m2",
      ].map((field) => [
        field,
        buildings.filter((b) => b[field] == null).length,
      ]),
    ),
    availableRegisterValues: Object.fromEntries(
      [
        "site_area_m2",
        "floor_area_ratio",
        "floors_above",
        "floors_below",
        "parking_total",
        "gross_area_m2",
        "approval_date",
      ].map((field) => [
        field,
        links.filter((r) => r[field] != null && Number(r[field]) !== 0).length,
      ]),
    ),
    componentLinks: links
      .filter(
        (r) =>
          buildings.find((b) => b.id === r.building_id)?.complex_scope ===
          "component",
      )
      .map((r) => ({
        building: buildings.find((b) => b.id === r.building_id)?.name,
        kind: r.record_kind,
        name: r.building_name,
        dong: r.dong_name,
        tower: r.tower_id,
        main_buildings: r.main_buildings,
        gross: r.gross_area_m2,
      })),
  };
  await mkdir("data/private/asset-overview", { recursive: true });
  await writeFile(
    "data/private/asset-overview/register-audit.json",
    JSON.stringify({ buildings, links, fields }, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await db.end();
}
