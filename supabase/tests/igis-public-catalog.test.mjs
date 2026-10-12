import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("anonymous IGIS discovery exposes approved catalog fields, never raw tables or financial data", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;
 create table public.buildings(id uuid primary key,complex_id uuid,name text,address text,standard_address text,road_address text,region text,status text,gross_area_m2 numeric not null,area_basis text,latitude numeric,longitude numeric,completion_year int,typical_floor_rentable_pyeong numeric,typical_floor_exclusive_pyeong numeric,typical_floor_scope text,typical_floor_source_period text,overview text,secret_fund_amount numeric);
 create table private.catalog_publications(record_type text,record_id uuid);
 grant usage on schema public to anon,authenticated;
 `);
    await db.exec(
      await readFile(
        new URL(
          "../migrations/202610120008_igis_public_discovery.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(`grant select on public.catalog_buildings to anon,authenticated;
 insert into buildings(id,name,status,gross_area_m2,secret_fund_amount) values
 ('10000000-0000-0000-0000-000000000001','Office','operating',1000,123456),
 ('10000000-0000-0000-0000-000000000002','Hotel','operating',null,654321),
 ('10000000-0000-0000-0000-000000000003','Private','operating',90000,987654),
 ('10000000-0000-0000-0000-000000000004','Inactive','inactive',1000,987654);
 insert into private.igis_catalog_publications(building_id,asset_category,source_as_of,evidence) values
 ('10000000-0000-0000-0000-000000000001','office','2026-10-06','{}'),
 ('10000000-0000-0000-0000-000000000002','hotel','2026-10-06','{}'),
 ('10000000-0000-0000-0000-000000000004','office','2026-10-06','{}');
 set role anon;`);
    const rows = (
      await db.query("select * from catalog_buildings order by name")
    ).rows;
    assert.deepEqual(
      rows.map((r) => r.name),
      ["Hotel", "Office"],
    );
    assert.equal(rows[0].gross_area_m2, null);
    assert.ok(
      rows.every(
        (r) =>
          r.is_igis === true &&
          !("secret_fund_amount" in r) &&
          !("overview" in r),
      ),
    );
    await assert.rejects(
      () => db.query("select * from buildings"),
      /permission denied/,
    );
    await assert.rejects(
      () => db.query("select * from private.igis_catalog_publications"),
      /permission denied/,
    );
    await assert.rejects(
      () => db.query("update catalog_buildings set name='changed'"),
      /permission denied|not automatically updatable|cannot update view/,
    );
  } finally {
    await db.close();
  }
});
