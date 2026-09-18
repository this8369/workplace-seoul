import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("catalog threshold, public write denial, private history and favorite isolation", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to anon,authenticated;
 grant execute on function auth.uid() to anon,authenticated;`);
    await db.exec(
      await readFile(
        new URL("../migrations/202609180001_core.sql", import.meta.url),
        "utf8",
      ),
    );
    const publicId = "10000000-0000-0000-0000-000000000001",
      hiddenId = "10000000-0000-0000-0000-000000000002";
    const a = "20000000-0000-0000-0000-000000000001",
      b = "20000000-0000-0000-0000-000000000002";
    await db.query(`insert into auth.users values($1),($2)`, [a, b]);
    await db.query(
      `insert into public.buildings(id,name,address,region,status,gross_area_m2,area_basis,source_name,verified_on,published) values($1,'Eligible','Test','CBD','operating',33057.86,'actual','Test',current_date,true),($2,'Below threshold','Test','CBD','operating',33057.85,'actual','Test',current_date,false)`,
      [publicId, hiddenId],
    );
    await assert.rejects(
      () =>
        db.query("update public.buildings set published=true where id=$1", [
          hiddenId,
        ]),
      /check constraint/,
    );
    await db.exec("set role anon");
    assert.equal(
      (await db.query("select * from public.buildings")).rows.length,
      1,
    );
    await assert.rejects(
      () => db.exec("update public.buildings set name='Changed'"),
      /permission denied/,
    );
    await assert.rejects(
      () => db.exec("select * from public.favorites"),
      /permission denied/,
    );
    await assert.rejects(
      () => db.exec("select * from private.building_revisions"),
      /permission denied/,
    );
    await db.exec("reset role; set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]);
    await db.query(
      "insert into public.favorites(user_id,building_id) values($1,$2)",
      [a, publicId],
    );
    await assert.rejects(
      () =>
        db.query(
          "insert into public.favorites(user_id,building_id) values($1,$2)",
          [b, publicId],
        ),
      /row-level security/,
    );
    await assert.rejects(
      () =>
        db.query(
          "insert into public.favorites(user_id,building_id) values($1,$2)",
          [a, hiddenId],
        ),
      /row-level security/,
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [b]);
    assert.equal(
      (await db.query("select * from public.favorites")).rows.length,
      0,
    );
    await db.exec("delete from public.favorites");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]);
    assert.equal(
      (await db.query("select * from public.favorites")).rows.length,
      1,
    );
    await db.exec("delete from public.favorites");
    assert.equal(
      (await db.query("select * from public.favorites")).rows.length,
      0,
    );
    await db.exec("reset role");
    await db.query("update public.buildings set name='Corrected' where id=$1", [
      publicId,
    ]);
    assert.equal(
      (await db.query("select * from private.building_revisions")).rows.length,
      1,
    );
  } finally {
    await db.close();
  }
});
