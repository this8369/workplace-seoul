import pg from "pg";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const dir = "data/private/";
const { reviewerEmail, ...config } = JSON.parse(
  await readFile(dir + "db-config.json", "utf8"),
);
const db = new pg.Client({
  ...config,
  password: (await readFile(dir + "db-password", "utf8")).trim(),
  ssl: {
    rejectUnauthorized: true,
    ca: await readFile(dir + "supabase-ca.crt", "utf8"),
  },
  connectionTimeoutMillis: 15000,
});
try {
  await db.connect();
  const report = JSON.parse(
    await readFile(dir + "address-report.json", "utf8"),
  );
  const buildings = (
    await db.query(
      "select id,address,standard_address,road_address,latitude,longitude,address_status from public.buildings",
    )
  ).rows;
  const trades = (
    await db.query(
      "select id,source_address,standard_address,road_address from public.transactions",
    )
  ).rows;
  const moves = (
    await db.query(
      "select id,from_source_address,from_standard_address,to_source_address,to_standard_address from public.tenant_movements",
    )
  ).rows;
  for (const r of report) {
    const row = (
      r.kind === "building"
        ? buildings
        : r.kind === "transaction"
          ? trades
          : moves
    ).find((b) => b.id === r.id);
    assert.ok(row);
    if (r.kind === "movement") {
      assert.equal(row[r.side + "_standard_address"], r.standard);
      assert.equal(row[r.side + "_source_address"], r.source);
    } else {
      assert.equal(row.standard_address, r.standard);
      assert.equal(
        row[r.kind === "building" ? "address" : "source_address"],
        r.source,
      );
      assert.equal(row.road_address || "", r.road);
    }
    if (r.kind === "building") {
      assert.equal(
        row.latitude === null ? null : Number(row.latitude),
        r.latitude,
      );
      assert.equal(
        row.longitude === null ? null : Number(row.longitude),
        r.longitude,
      );
      assert.equal(row.address_status, r.status);
    }
  }
  console.log(
    "Verified against Sheet address report:",
    report.length,
    "addresses;",
    buildings.filter((b) => b.latitude !== null).length,
    "mapped assets.",
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
