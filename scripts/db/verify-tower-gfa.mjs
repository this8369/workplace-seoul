import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { connectDatabase } from "../building-register/vworld-client.mjs";
const db = await connectDatabase();
try {
  const c = (
    await db.query(
      "select * from public.building_complexes where name='IFC Seoul' and published",
    )
  ).rows[0];
  assert(c);
  const buildings = (
    await db.query(
      "select * from public.buildings where complex_id=$1 and complex_scope='component' order by name",
      [c.id],
    )
  ).rows;
  assert.equal(buildings.length, 3);
  assert(
    buildings.every(
      (b) =>
        Number(b.gross_area_m2) > 0 &&
        Number(b.gross_area_m2) < Number(c.gross_area_m2),
    ),
  );
  const fixture = { building_complexes: [c], buildings };
  for (const table of ["building_asset_profiles", "building_power_specs"])
    fixture[table] = (
      await db.query(`select * from public.${table} where id=any($1::uuid[])`, [
        buildings.map((b) => b.id),
      ])
    ).rows;
  fixture.building_towers = (
    await db.query("select * from public.building_towers where complex_id=$1", [
      c.id,
    ])
  ).rows;
  if (process.argv.includes("--fixture"))
    await writeFile(
      "/tmp/workplace-ifc-gfa-fixture.json",
      JSON.stringify(fixture),
    );
  console.log(
    JSON.stringify({
      towers: buildings.map((b) => ({
        name: b.name,
        m2: Number(b.gross_area_m2),
        pyeong: Math.round((Number(b.gross_area_m2) * 121) / 400),
      })),
      complexTotalM2: Number(c.gross_area_m2),
      readOnly: true,
    }),
  );
} finally {
  await db.end();
}
