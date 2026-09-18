import pg from "pg";
import { readFile } from "node:fs/promises";
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
  const stats = await db.query(
    "select tablename,rowsecurity from pg_tables where schemaname in ('public','private') order by tablename",
  );
  console.log(
    "All application tables protected:",
    stats.rows.every((r) => r.rowsecurity),
  );
  const media = await db.query(`select count(*)::int photos, count(*) filter(where is_primary)::int primary_photos,
    count(*) filter(where review_status='approved' and (object_path is null or thumbnail_path is null))::int incomplete
    from building_images`);
  const objects = await db.query("select count(*)::int objects from storage.objects where bucket_id='building-images'");
  const districts = await db.query("select key from districts order by sort_order");
  if(media.rows[0].incomplete) throw new Error('Incomplete approved photos');
  if(districts.rows.map(r=>r.key).join(',') !== 'CBD,GBD,YBD,Others,BBD') throw new Error('Invalid district order');
  console.log('Photo storage:',media.rows[0],objects.rows[0]);
  console.log('District master: 5 regions, correct display order');
  await db.query("begin");
  await db.query("set local role anon");
  for (const t of [
    "buildings",
    "transactions",
    "occupancies",
    "tenant_movements",
    "leasing_quarters",
    "development_records",
  ]) {
    const r = await db.query(`select count(*)::int count from public.${t}`);
    if (r.rows[0].count !== 0) throw new Error("Draft exposure: " + t);
  }
  await db.query("rollback");
  console.log("Anonymous draft access: none");
  const env = await readFile(".env.local", "utf8");
  const url = env.match(/^VITE_SUPABASE_URL=(.*)$/m)[1],
    key = env.match(/^VITE_SUPABASE_PUBLISHABLE_KEY=(.*)$/m)[1];
  for (const t of [
    "buildings",
    "transactions",
    "companies",
    "occupancies",
    "tenant_movements",
    "leasing_quarters",
    "development_records",
  ]) {
    const r = await fetch(url + "/rest/v1/" + t + "?select=id&limit=1", {
      headers: { apikey: key },
    });
    const body = await r.json();
    if (!r.ok || !Array.isArray(body) || body.length)
      throw new Error("Data API verification failed: " + t + " " + r.status);
  }
  console.log("Supabase Data API: all 7 collections reachable, drafts hidden");
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
