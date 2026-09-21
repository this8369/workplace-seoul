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
  const rows = (
    await db.query(
      "select id,name,status,address,road_address,complex_id,completion_year,usage_approved_on,completion_source_url,typical_floor_source_url,gross_area_m2,latitude,longitude from buildings order by name",
    )
  ).rows;
  const stats = (
    await db.query(
      "select status,count(*)::int total,count(completion_year)::int years,count(usage_approved_on)::int dates,count(*) filter(where completion_year is null and usage_approved_on is not null)::int dates_without_year from buildings group by status",
    )
  ).rows;
  await writeFile(
    "data/private/completion-audit.json",
    JSON.stringify({ stats, buildings: rows }, null, 2),
  );
  console.log(JSON.stringify(stats));
  console.log(
    "Missing operating years:",
    rows
      .filter((r) => r.status === "operating" && !r.completion_year)
      .map((r) => r.name),
  );
  console.log(
    "Known samples:",
    rows
      .filter((r) => r.status === "operating" && r.completion_year)
      .slice(0, 6)
      .map((r) => ({ name: r.name, year: r.completion_year })),
  );
} finally {
  await db.end();
}
