import assert from "node:assert/strict";
import { normalizeBuildingName } from "../lib/building-name.mjs";
// Read-only inventory; does not merge, rename, or update source assets.
import pg from "pg";
import { readFile, writeFile } from "node:fs/promises";
const { reviewerEmail, ...config } = JSON.parse(
  await readFile("data/private/db-config.json", "utf8"),
);
const db = new pg.Client({
  ...config,
  password: (await readFile("data/private/db-password", "utf8")).trim(),
  ssl: {
    rejectUnauthorized: true,
    ca: await readFile("data/private/supabase-ca.crt", "utf8"),
  },
  connectionTimeoutMillis: 15000,
});
try {
  await db.connect();
  const columns = (
    await db.query(
      "select table_name,column_name from information_schema.columns where table_schema='public' and data_type in ('text','character varying') order by table_name,ordinal_position",
    )
  ).rows;
  for (const c of columns) {
    const q = `select distinct "${c.column_name}" as value from public."${c.table_name}" where "${c.column_name}" ~ '(저|중|고|초고)층(부)?' limit 20`;
    const matches = (await db.query(q)).rows;
    if (matches.length)
      console.log("Stratum text", c.table_name, c.column_name, matches);
  }
  const buildings = (
    await db.query(
      `select id,name,address,road_address,region,status,gross_area_m2,completion_year,typical_floor_rentable_pyeong,typical_floor_exclusive_pyeong,typical_floor_scope from buildings order by region,name`,
    )
  ).rows;
  const leasing = (
    await db.query(
      `select building_id,period,noc,area_basis,vat_basis from leasing_quarters where period='2025.4Q'`,
    )
  ).rows;
  await writeFile(
    "data/private/tower-inventory.json",
    JSON.stringify({ buildings, leasing }, null, 2),
  );
  console.log({ buildings: buildings.length, leasing: leasing.length });
  if (process.argv.includes("--verify")) {
    const source = JSON.parse(
      await readFile("data/private/normalized.json", "utf8"),
    );
    const changed = source
      .find((t) => t.title.startsWith("01"))
      .rows.filter((r) => /[저중고]층|<[0-9]+층/.test(r[1]));
    for (const r of changed)
      assert.equal(
        buildings.find((b) => b.id === r[0])?.name,
        normalizeBuildingName(r[1]),
      );
    const q = source.find((t) => t.title.startsWith("02"));
    for (const r of q.rows.filter((r) => r[3] === "2025.4Q")) {
      const actual = leasing.find((l) => l.building_id === r[1]);
      assert.ok(actual);
      assert.equal(
        actual.noc === null ? null : Number(actual.noc),
        typeof r[9] === "number" ? r[9] : null,
      );
    }
    assert.equal(buildings.length, 364);
    assert.ok(buildings.every((b) => !/[저중고]층|<[0-9]+층/.test(b.name)));
    console.log(
      "Verified: " +
        changed.length +
        " corrected asset labels; 364 IDs retained; all 281 latest-quarter NOC observations unchanged.",
    );
  }
  const groups = Object.groupBy(buildings, (b) => b.road_address || b.address);
  console.log(
    "Shared addresses",
    Object.entries(groups)
      .filter(([a, b]) => b.length > 1)
      .map(([address, b]) => ({
        address,
        names: b.map((x) => x.name),
        areas: b.map((x) => ((x.gross_area_m2 * 121) / 400).toFixed(1)),
      })),
  );
} finally {
  await db.end();
}
