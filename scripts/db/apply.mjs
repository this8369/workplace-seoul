import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
const config = JSON.parse(
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
  if (process.argv.includes("--inspect")) {
    console.log(
      (
        await db.query(
          "select schemaname,tablename from pg_tables where schemaname in ('public','private') order by 1,2",
        )
      ).rows,
    );
  } else {
    await db.query(
      "create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations(version text primary key, statements text[], name text)",
    );
    for (const file of (await readdir("supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      const version = file.split("_")[0];
      if (
        (
          await db.query(
            "select version from supabase_migrations.schema_migrations where version=$1",
            [version],
          )
        ).rowCount
      )
        continue;
      const sql = await readFile("supabase/migrations/" + file, "utf8");
      // Keep DDL and migration receipt in one transaction.
      await db.query("begin");
      try {
        await db.query(
          sql.replace(/^begin;\s*/, "").replace(/commit;\s*$/, ""),
        );
        await db.query(
          "insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)",
          [version, file.replace(/^\d+_|\.sql$/g, ""), [sql]],
        );
        await db.query("commit");
        console.log("Applied", file);
      } catch (e) {
        await db.query("rollback");
        throw e;
      }
    }
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
