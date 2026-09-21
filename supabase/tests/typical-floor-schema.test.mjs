import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("explicit floor areas preserve unknown basis, constrain values, and keep ingestion audit private", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;`,
    );
    for (const name of [
      "202609180001_core.sql",
      "202609180002_sheet_ingestion.sql",
      "202609180003_asset_archive.sql",
      "202609180004_review_workspace.sql",
      "202609180005_source_date_precision.sql",
      "202609180015_typical_floor_area.sql",
      "202609180016_typical_floor_split.sql",
      "202609210001_completion_provenance.sql",
      "202609210006_completion_sources.sql",
    ])
      await db.exec(
        await readFile(
          new URL("../migrations/" + name, import.meta.url),
          "utf8",
        ),
      );
    await db.exec(
      `insert into buildings(name,address,region,status,gross_area_m2,area_basis,source_name,typical_floor_area_pyeong) values('Test','Address','CBD','operating',40000,'actual','test',200)`,
    );
    let row = (await db.query("select * from buildings")).rows[0];
    assert.equal(row.typical_floor_rentable_pyeong, null);
    assert.equal(row.typical_floor_exclusive_pyeong, null);
    await assert.rejects(
      () =>
        db.exec(
          "update buildings set typical_floor_rentable_pyeong=100,typical_floor_exclusive_pyeong=200",
        ),
      /check constraint/,
    );
    await assert.rejects(
      () => db.exec("update buildings set typical_floor_exclusive_pyeong=0"),
      /check constraint/,
    );
    await db.exec(
      "update buildings set typical_floor_rentable_pyeong=300,typical_floor_exclusive_pyeong=200",
    );
    await assert.rejects(
      () =>
        db.exec(
          "update buildings set completion_year=2019,usage_approved_on='2020-01-01'",
        ),
      /check constraint/,
    );
    await db.exec(
      "update buildings set completion_year=2020,usage_approved_on='2020-01-01'",
    );
    await db.exec(
      "update buildings set usage_approved_on=null,completion_source_url='https://owner.example.com/history'",
    );
    row = (await db.query("select * from buildings")).rows[0];
    assert.equal(row.completion_year, 2020);
    assert.equal(
      row.usage_approved_on,
      null,
      "Year-only evidence must not fabricate an approval date",
    );
    await assert.rejects(
      () =>
        db.exec(
          "update buildings set completion_source_url='javascript:alert(1)'",
        ),
      /check constraint/,
    );
    await assert.rejects(
      () => db.exec("update buildings set usage_approved_on='2021-01-01'"),
      /check constraint/,
    );
    await db.exec("set role anon");
    assert.equal((await db.query("select * from buildings")).rows.length, 0);
    await assert.rejects(
      () => db.exec("select * from private.officefind_floor_imports"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
