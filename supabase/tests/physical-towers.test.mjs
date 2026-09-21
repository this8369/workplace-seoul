import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("tower storage isolates draft data, validates membership and retains independent observations", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;`,
    );
    for (const file of [
      "202609180001_core.sql",
      "202609180003_asset_archive.sql",
    ])
      await db.exec(
        await readFile(
          new URL("../migrations/" + file, import.meta.url),
          "utf8",
        ),
      );
    await db.exec(
      `create function public.can_review_records() returns boolean language sql stable as $$select current_setting('test.reviewer',true)='yes'$$`,
    );
    await db.exec(
      await readFile(
        new URL(
          "../migrations/202609210005_physical_towers.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const a = (
      await db.query(
        `insert into buildings(name,address,region,status,gross_area_m2,area_basis,source_name,verified_on) values('A','addr','CBD','operating',40000,'actual','test','2026-09-21') returning id`,
      )
    ).rows[0].id;
    const c = (
      await db.query(
        `insert into building_complexes(name,representative_building_id,gross_area_m2,area_method,source_note) values('Complex',$1,40000,'aggregate_record','test') returning id`,
        [a],
      )
    ).rows[0].id;
    await assert.rejects(
      () =>
        db.query(
          `insert into building_towers(complex_id,building_id,label,sort_order) values($1,$2,'A동',0)`,
          [c, a],
        ),
      /same complex/,
    );
    await db.query("update buildings set complex_id=$1 where id=$2", [c, a]);
    await db.query(
      `insert into building_towers(complex_id,building_id,label,sort_order,typical_floor_rentable_pyeong,typical_floor_exclusive_pyeong,source_url,collected_at,content_hash) values($1,$2,'A동',0,800,400,'https://officefind.co.kr/a',now(),'hash')`,
      [c, a],
    );
    await assert.rejects(
      () =>
        db.query(
          `insert into building_towers(complex_id,label,sort_order) values($1,'저층부',1)`,
          [c],
        ),
      /check constraint/,
    );
    await assert.rejects(
      () =>
        db.query(
          `insert into building_towers(complex_id,label,sort_order,typical_floor_rentable_pyeong) values($1,'B동',1,600)`,
          [c],
        ),
      /check constraint/,
    );
    await db.exec("set role anon");
    assert.equal(
      (await db.query("select * from building_complexes")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from building_towers")).rows.length,
      0,
    );
    await assert.rejects(
      () =>
        db.query("update building_towers set typical_floor_rentable_pyeong=1"),
      /permission denied/,
    );
    await db.exec("set role authenticated;set test.reviewer='yes'");
    assert.equal(
      (await db.query("select * from building_complexes")).rows.length,
      1,
    );
    assert.equal(
      (await db.query("select * from building_towers")).rows.length,
      1,
    );
  } finally {
    await db.close();
  }
});
