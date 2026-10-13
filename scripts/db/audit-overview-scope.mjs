import { writeFile } from "node:fs/promises";
import { connectDatabase } from "../building-register/vworld-client.mjs";
const db = await connectDatabase();
try {
  const data = {};
  for (const table of [
    "building_complexes",
    "buildings",
    "building_towers",
    "building_asset_profiles",
    "building_power_specs",
    "building_facts",
  ])
    data[table] = (await db.query(`select * from public.${table}`)).rows;
  await writeFile(
    "data/private/complexes/overview-scope-before.json",
    JSON.stringify(data),
  );
  console.log(
    JSON.stringify({
      complexes: data.building_complexes.map((c) => ({
        name: c.name,
        published: c.published,
        representative: c.representative_building_id,
        scope: data.buildings.find((b) => b.id === c.representative_building_id)
          ?.complex_scope,
        common: c.common_facts,
      })),
      facts: data.building_facts
        .filter((f) => f.complex_id)
        .map((f) => ({
          field: f.field_key,
          value: f.value,
          unit: f.unit,
          complex: f.complex_id,
        })),
    }),
  );
} finally {
  await db.end();
}
