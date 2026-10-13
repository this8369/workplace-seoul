import { readFile, writeFile } from "node:fs/promises";
import { connectDatabase } from "../building-register/vworld-client.mjs";
const db = await connectDatabase();
try {
  const mappings = (
    await db.query(
      "select m.*,c.name complex_name from private.complex_component_assets m join building_towers t on t.id=m.tower_id join building_complexes c on c.id=t.complex_id order by c.name",
    )
  ).rows;
  const ids = [...new Set(mappings.map((m) => m.parent_building_id))];
  const report = {};
  for (const [table, col] of [
    ["buildings", "id"],
    ["building_asset_profiles", "id"],
    ["building_power_specs", "id"],
    ["leasing_quarters", "building_id"],
    ["development_records", "building_id"],
    ["occupancies", "building_id"],
    ["transactions", "building_id"],
    ["building_facts", "building_id"],
    ["building_parcels", "building_id"],
    ["building_places", "building_id"],
    ["building_green_spaces", "building_id"],
    ["building_register_links", "building_id"],
  ])
    report[table] = (
      await db.query(
        `select * from public.${table} where ${col}=any($1::uuid[])`,
        [ids],
      )
    ).rows;
  const snapshot = JSON.parse(
    await readFile(
      "data/private/complexes/component-assets-before-1791890394735.json",
      "utf8",
    ),
  );
  const allIds = new Set(
    (await db.query("select id from public.buildings")).rows.map((r) => r.id),
  );
  const imageIds = new Set(
    (await db.query("select id from public.building_images")).rows.map(
      (r) => r.id,
    ),
  );
  const missingOriginalAssets = snapshot.buildings
    .filter((r) => !allIds.has(r.id))
    .map((r) => r.name);
  const missingOriginalImages = snapshot.images
    .filter((r) => !imageIds.has(r.id))
    .map((r) => r.id);
  const changes = [];
  for (const b of report.buildings) {
    const old = snapshot.buildings.find((r) => r.id === b.id);
    if (old)
      for (const k of Object.keys(old)) {
        if (
          !["updated_at", "complex_id", "complex_scope"].includes(k) &&
          JSON.stringify(old[k]) !== JSON.stringify(b[k])
        )
          changes.push({ name: b.name, field: k, before: old[k], after: b[k] });
      }
  }
  await writeFile(
    "data/private/complexes/information-recovery-audit.json",
    JSON.stringify({ mappings, report, changes }, null, 2),
  );
  const center = mappings.find((m) => m.complex_name === "센터필드");
  console.log(
    JSON.stringify(
      {
        originalAssetsChecked: snapshot.buildings.length,
        missingOriginalAssets,
        missingOriginalImages,
        parents: ids.length,
        components: mappings.length,
        rowCounts: Object.fromEntries(
          Object.entries(report).map(([k, v]) => [k, v.length]),
        ),
        changes,
        centerfield: Object.fromEntries(
          Object.entries(report).map(([k, v]) => [
            k,
            k === "building_asset_profiles" ||
            k === "building_power_specs" ||
            k === "buildings"
              ? v.filter(
                  (r) => (r.building_id || r.id) === center.parent_building_id,
                )
              : v.filter((r) => r.building_id === center.parent_building_id)
                  .length,
          ]),
        ),
      },
      null,
      2,
    ),
  );
} finally {
  await db.end();
}
