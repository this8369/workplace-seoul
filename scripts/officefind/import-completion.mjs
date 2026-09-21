// Reuse already collected, identity-checked public pages. No source requests.
import pg from "pg";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseOffice, identityMatch, parseApproval } from "./parser.mjs";
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
  const sources = (
    await db.query(
      // Completion evidence is independent of floor-area matching status.
      // Revalidate the building identity below, including previously ambiguous
      // floor records, without accepting a different tower's approval date.
      "select * from private.officefind_floor_imports where source_url is not null",
    )
  ).rows;
  const report = [];
  console.log("Before:", {
    total: buildings.length,
    completion: buildings.filter((b) => b.completion_year != null).length,
  });
  for (const r of sources) {
    const b = buildings.find((b) => b.id === r.building_id);
    if (!b || b.status !== "operating") continue;
    const file = createHash("sha256").update(r.source_url).digest("hex");
    let page;
    try {
      page = JSON.parse(await readFile(`${root}/pages/${file}.json`, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      report.push({ id: b.id, name: b.name, status: "source-not-cached" });
      continue;
    }
    const spec = parseOffice(page.text, page.url);
    const identity = identityMatch(b, spec, buildings);
    if (!identity.ok) {
      report.push({ id: b.id, name: b.name, status: identity.reason });
      continue;
    }
    const value = parseApproval(page.text);
    if (!value.date) {
      report.push({
        id: b.id,
        name: b.name,
        status: value.reason,
        raw: value.raw,
      });
      continue;
    }
    const result = await db.query(
      `update buildings set completion_year=$2,usage_approved_on=$3,completion_source_url=$4,completion_collected_at=$5 where id=$1 and (completion_year is null or completion_year=$2) and (usage_approved_on is null or usage_approved_on=$3::date) and (completion_source_url is null or completion_source_url=$4) returning id`,
      [b.id, value.year, value.date, page.url, page.fetched_at],
    );
    report.push({
      id: b.id,
      name: b.name,
      status: result.rowCount ? "matched" : "existing-value-conflict",
      ...value,
      url: page.url,
    });
  }
  await writeFile(
    `${root}/completion-results.json`,
    JSON.stringify(report, null, 2),
  );
  const counts = (
    await db.query(
      `select status,count(*)::int total,count(completion_year)::int completion,count(usage_approved_on)::int approval from buildings group by status`,
    )
  ).rows;
  const development = (
    await db.query(
      `select count(*)::int total,count(*) filter(where year ~ '^[0-9]{4}$')::int planned_year,count(*) filter(where year='미정')::int undecided from development_records`,
    )
  ).rows;
  const summary = {
    counts,
    development,
    statuses: report.reduce(
      (a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a),
      {},
    ),
    excluded: report.filter((r) => r.status !== "matched"),
  };
  await writeFile(
    `${root}/completion-summary.json`,
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary));
} finally {
  await db.end();
}
