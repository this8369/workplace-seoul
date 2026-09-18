import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("archive records follow building/company publication and prohibit unverified links and public writes", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$select null::uuid$$; grant usage on schema public,auth to anon,authenticated;`,
    );
    for (const name of [
      "202609180001_core.sql",
      "202609180003_asset_archive.sql",
    ])
      await db.exec(
        await readFile(
          new URL("../migrations/" + name, import.meta.url),
          "utf8",
        ),
      );
    const a = "10000000-0000-0000-0000-000000000001",
      b = "10000000-0000-0000-0000-000000000002",
      c = "20000000-0000-0000-0000-000000000001";
    await db.query(
      `insert into public.buildings(id,name,address,region,status,gross_area_m2,area_basis,source_name,verified_on,published) values($1,'A','Test','CBD','operating',40000,'actual','Test',current_date,true),($2,'B','Test','CBD','operating',40000,'actual','Test',current_date,false)`,
      [a, b],
    );
    await db.query(
      `insert into public.companies(id,name,published) values($1,'Company',true)`,
      [c],
    );
    for (const id of [a, b]) {
      await db.query(
        `insert into public.transactions(building_id,building_name,region,source_name,link_status,published) values($1,'Test','CBD','Test','verified',true)`,
        [id],
      );
      await db.query(
        `insert into public.occupancies(building_id,company_id,status,source_name,as_of,published) values($1,$2,'confirmed','Test',current_date,true)`,
        [id, c],
      );
    }
    await assert.rejects(
      () =>
        db.query(
          `insert into public.transactions(building_id,building_name,region,source_name,link_status,published) values($1,'Test','CBD','Test','candidate',true)`,
          [a],
        ),
      /check constraint/,
    );
    await db.exec("set role anon");
    assert.equal(
      (await db.query("select * from public.transactions")).rows.length,
      1,
    );
    assert.equal(
      (await db.query("select * from public.occupancies")).rows.length,
      1,
    );
    await assert.rejects(
      () => db.exec("update public.transactions set note='write'"),
      /permission denied/,
    );
    await db.exec("reset role");
    await db.query("update public.companies set published=false where id=$1", [
      c,
    ]);
    await db.exec("set role authenticated");
    assert.equal(
      (await db.query("select * from public.occupancies")).rows.length,
      0,
    );
    await db.exec("reset role");
    await db.query("update public.buildings set published=false where id=$1", [
      a,
    ]);
    await db.exec("set role anon");
    assert.equal(
      (await db.query("select * from public.transactions")).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
