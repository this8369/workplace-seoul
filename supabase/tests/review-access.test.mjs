import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("only an allowlisted, verified auth user can read draft assets; never original snapshots", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema public,auth to anon,authenticated;`,
    );
    for (const name of [
      "202609180001_core.sql",
      "202609180002_sheet_ingestion.sql",
      "202609180003_asset_archive.sql",
      "202609180004_review_workspace.sql",
      "202609180005_source_date_precision.sql",
    ])
      await db.exec(
        await readFile(
          new URL("../migrations/" + name, import.meta.url),
          "utf8",
        ),
      );
    const editor = "30000000-0000-0000-0000-000000000001",
      other = "30000000-0000-0000-0000-000000000002",
      draft = "10000000-0000-0000-0000-000000000001";
    await db.query(
      "insert into auth.users values($1,'reviewer@example.test',now()),($2,'other@example.test',now())",
      [editor, other],
    );
    await db.exec(
      "insert into private.reviewers values('reviewer@example.test')",
    );
    await db.query(
      "insert into public.buildings(id,name,address,region,status,gross_area_m2,area_basis,source_name) values($1,'Draft','Test','CBD','operating',40000,'actual','Test')",
      [draft],
    );
    await assert.rejects(
      () =>
        db.query("update public.buildings set published=true where id=$1", [
          draft,
        ]),
      /check constraint/,
    );
    await db.exec("set role anon");
    assert.equal(
      (await db.query("select * from public.buildings")).rows.length,
      0,
    );
    await db.exec("reset role;set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      other,
    ]);
    assert.equal(
      (await db.query("select * from public.buildings")).rows.length,
      0,
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      editor,
    ]);
    assert.equal(
      (await db.query("select * from public.buildings")).rows.length,
      1,
    );
    await assert.rejects(
      () => db.exec("select * from private.source_snapshots"),
      /permission denied/,
    );
    await assert.rejects(
      () => db.exec("delete from public.buildings"),
      /permission denied/,
    );
    await db.exec("reset role");
    await db.query(
      "update auth.users set email_confirmed_at=null where id=$1",
      [editor],
    );
    await db.exec("set role authenticated");
    assert.equal(
      (await db.query("select * from public.buildings")).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
