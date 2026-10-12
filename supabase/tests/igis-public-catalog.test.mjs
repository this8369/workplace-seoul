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
 create table private.master_assets(id uuid primary key,existing_building_id uuid);
 create table private.master_investment_objects(asset_id uuid,underlying_sector text,source_sold_flag boolean,resolution_status text);
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
    await db.exec(await readFile(new URL("../migrations/202610120014_igis_mixed_use.sql", import.meta.url), "utf8"));
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
 insert into private.master_assets select id,id from buildings;
 insert into private.master_investment_objects values
 ('10000000-0000-0000-0000-000000000001','오피스복합',false,'verified_source_evidence'),
 ('10000000-0000-0000-0000-000000000001','오피스복합',false,'verified_source_evidence'),
 ('10000000-0000-0000-0000-000000000002','호텔복합',true,'verified_source_evidence'),
 ('10000000-0000-0000-0000-000000000002','호텔복합',false,'candidate'),
 ('10000000-0000-0000-0000-000000000003','오피스복합',false,'verified_source_evidence');
 set role anon;`);
    const rows = (
      await db.query("select * from catalog_buildings order by name")
    ).rows;
    assert.deepEqual(
      rows.map((r) => r.name),
      ["Hotel", "Office"],
    );
    assert.equal(rows[0].gross_area_m2, null);
    assert.equal(rows[0].is_mixed_use, false); // Sold or unverified positions do not qualify.
    assert.equal(rows[1].is_mixed_use, true);
    assert.equal(rows[1].asset_category, "office");
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
    await assert.rejects(() => db.query("select * from private.master_investment_objects"), /permission denied/);
    await assert.rejects(
      () => db.query("update catalog_buildings set name='changed'"),
      /permission denied|not automatically updatable|cannot update view/,
    );
    await db.exec(`reset role;
      update private.master_investment_objects set underlying_sector='오피스' where asset_id='10000000-0000-0000-0000-000000000001';
      update private.master_investment_objects set source_sold_flag=false where asset_id='10000000-0000-0000-0000-000000000002' and resolution_status='verified_source_evidence';
      set role anon;`);
    const updated = (await db.query("select name,asset_category,is_mixed_use from catalog_buildings order by name")).rows;
    assert.deepEqual(updated, [
      { name: "Hotel", asset_category: "hotel", is_mixed_use: true },
      { name: "Office", asset_category: "office", is_mixed_use: false },
    ]);
  } finally {
    await db.close();
  }
});
