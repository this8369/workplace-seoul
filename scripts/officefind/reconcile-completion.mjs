// Apply an identity-reviewed completion plan independently of floor-area matching.
// The plan and audit records remain private; existing populated years are preserved.
import pg from "pg";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
const plan = JSON.parse(
  await readFile("data/private/completion-repair-plan.json", "utf8"),
);
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
  await db.query("begin");
  const before = (
    await db.query("select * from buildings order by id for update")
  ).rows;
  const audit = [];
  for (const row of plan) {
    const old = before.find((b) => b.id === row.id);
    assert.ok(old);
    assert.equal(old.name, row.name);
    assert.equal(old.status, "operating");
    assert.ok(
      Number.isInteger(row.year) &&
        row.year >= 1800 &&
        row.year <= new Date().getUTCFullYear(),
    );
    assert.ok(new URL(row.url).protocol === "https:");
    assert.ok(row.reason && row.sources.length);
    if (row.date) assert.equal(Number(row.date.slice(0, 4)), row.year);
    if (old.completion_year != null) {
      assert.equal(
        old.completion_year,
        row.year,
        "Existing completion year conflict",
      );
      continue;
    }
    assert.equal(
      old.usage_approved_on,
      null,
      "Preserve independently recorded approval date",
    );
    await db.query(
      "update buildings set completion_year=$2,usage_approved_on=$3,completion_source_url=$4,completion_collected_at=now() where id=$1 and completion_year is null",
      [row.id, row.year, row.date, row.url],
    );
    audit.push({
      ...row,
      previous: {
        completion_year: old.completion_year,
        usage_approved_on: old.usage_approved_on,
        completion_source_url: old.completion_source_url,
      },
    });
  }
  const after = (await db.query("select * from buildings order by id")).rows;
  for (let i = 0; i < before.length; i++)
    for (const key of Object.keys(before[i]).filter(
      (k) =>
        ![
          "completion_year",
          "usage_approved_on",
          "completion_source_url",
          "completion_collected_at",
          "updated_at",
        ].includes(k),
    ))
      assert.deepEqual(
        after[i][key],
        before[i][key],
        `Unrelated field changed: ${key}`,
      );
  await writeFile(
    "data/private/completion-repair-audit.json",
    JSON.stringify(
      {
        reviewed_at: new Date().toISOString(),
        applied: process.argv.includes("--apply"),
        rows: audit,
      },
      null,
      2,
    ),
  );
  await db.query(process.argv.includes("--apply") ? "commit" : "rollback");
  console.log(
    JSON.stringify({
      applied: process.argv.includes("--apply"),
      changed: audit.length,
      operating: after.filter((b) => b.status === "operating").length,
      completion: after.filter(
        (b) => b.status === "operating" && b.completion_year,
      ).length,
    }),
  );
} catch (e) {
  await db.query("rollback").catch(() => {});
  throw e;
} finally {
  await db.end();
}
