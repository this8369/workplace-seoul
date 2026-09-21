import pg from "pg";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
pg.types.setTypeParser(1700, Number);
pg.types.setTypeParser(1082, (value) => value);
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
  const tables = [
    "building_register_records",
    "building_register_links",
    "building_register_floors",
    "building_register_area_parts",
    "building_register_sections",
  ];
  const fixture = {};
  for (const table of tables)
    fixture[table] = (
      await db.query(`select * from public.${table} order by id`)
    ).rows;
  const ids = [
    ...new Set(fixture.building_register_links.map((l) => l.building_id)),
  ];
  fixture.buildings = (
    await db.query("select * from buildings where id=any($1::uuid[])", [ids])
  ).rows;
  const raw = (
    await db.query(
      "select operation,response from private.building_register_snapshots",
    )
  ).rows;
  const key = (
    await readFile("data/private/building-register-key", "utf8")
  ).trim();
  assert.ok(
    !JSON.stringify({ fixture, raw }).includes(key),
    "Credential must not be stored in DB records",
  );
  assert.ok(
    fixture.building_register_records.some(
      (r) =>
        r.building_name === "그랜드 센트럴(GRAND CENTRAL)" &&
        r.approval_date === "2020-07-08",
    ),
  );
  assert.equal(fixture.building_register_floors.length, 51);
  await writeFile(
    "data/private/building-register-ui-fixture.json",
    JSON.stringify(fixture, null, 2),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      counts: Object.fromEntries(tables.map((t) => [t, fixture[t].length])),
      snapshots: raw.length,
      credentialAbsent: true,
      assets: fixture.buildings.map((b) => b.name),
    }),
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
