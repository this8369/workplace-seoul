import pg from "pg";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { identityMatch, parseOffice } from "./parser.mjs";
const root = "data/private/officefind";
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
await db.connect();
try {
  const buildings = (await db.query("select * from buildings")).rows;
  const imports = (
    await db.query(
      "select * from private.officefind_floor_imports where status='matched'",
    )
  ).rows;
  const cache = JSON.parse(await readFile(`${root}/results.json`, "utf8"));
  const rejected = [];
  let verified = 0;
  for (const record of imports) {
    const b = buildings.find((b) => b.id === record.building_id);
    const key = createHash("sha256").update(record.source_url).digest("hex");
    const page = JSON.parse(
      await readFile(`${root}/pages/${key}.json`, "utf8"),
    );
    assert.equal(
      createHash("sha256").update(page.text).digest("hex"),
      record.content_hash,
    );
    const spec = parseOffice(page.text, record.source_url),
      match = identityMatch(b, spec, buildings);
    if (!match.ok) {
      rejected.push({ name: b.name, source: spec.name, reason: match.reason });
      if (process.argv.includes("--repair")) {
        await db.query("begin");
        try {
          const result = await db.query(
            `update buildings set typical_floor_rentable_pyeong=null,typical_floor_exclusive_pyeong=null,typical_floor_source_url=null,typical_floor_source_period=null,typical_floor_collected_at=null where id=$1 and typical_floor_source_url=$2 and typical_floor_rentable_pyeong is not distinct from $3::numeric and typical_floor_exclusive_pyeong is not distinct from $4::numeric`,
            [
              b.id,
              record.source_url,
              record.rentable_pyeong,
              record.exclusive_pyeong,
            ],
          );
          assert.equal(
            result.rowCount,
            1,
            "Preserve independently changed data",
          );
          await db.query(
            "update private.officefind_floor_imports set status='ambiguous',match_reason=$2 where building_id=$1",
            [b.id, match.reason],
          );
          await db.query("commit");
          cache[b.id].status = "ambiguous";
          cache[b.id].match_reason = match.reason;
        } catch (e) {
          await db.query("rollback");
          throw e;
        }
      }
      continue;
    }
    assert.deepEqual(spec.warnings, []);
    assert.equal(Number(b.typical_floor_rentable_pyeong), spec.rentable_pyeong);
    assert.equal(
      Number(b.typical_floor_exclusive_pyeong),
      spec.exclusive_pyeong,
    );
    verified++;
  }
  if (process.argv.includes("--repair"))
    await writeFile(`${root}/results.json`, JSON.stringify(cache, null, 2));
  const counts = (
    await db.query(
      `select status,count(*)::int total,count(typical_floor_rentable_pyeong)::int rentable,count(typical_floor_exclusive_pyeong)::int exclusive from buildings group by status order by status`,
    )
  ).rows;
  const statuses = (
    await db.query(
      "select status,count(*)::int count from private.officefind_floor_imports group by status order by status",
    )
  ).rows;
  const development = (
    await db.query(
      `select count(*)::int records,count(nullif(trim(developer),''))::int owner_developer,count(nullif(trim(contractor),''))::int contractor from development_records`,
    )
  ).rows[0];
  const report = {
    verified,
    rejected,
    counts,
    statuses,
    development,
    verified_at: new Date().toISOString(),
  };
  await writeFile(`${root}/verification.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (rejected.length && !process.argv.includes("--repair"))
    process.exitCode = 1;
} finally {
  await db.end();
}
