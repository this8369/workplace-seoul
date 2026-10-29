import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("register overview stays live, preserves manual facts, separates common/component scope and rejects unverified evidence", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create schema private;
  create table buildings(id uuid primary key default gen_random_uuid(),name text,address text,region text,status text default 'operating',gross_area_m2 numeric(16,6),area_basis text,latitude numeric,longitude numeric,overview text,floors_above integer,floors_below integer,completion_year integer,parking_spaces integer,source_name text,source_url text,verified_on date,published boolean default true,source_as_of text,standard_address text,road_address text,address_status text,typical_floor_area_pyeong numeric,typical_floor_rentable_pyeong numeric,typical_floor_exclusive_pyeong numeric,typical_floor_source_url text,typical_floor_source_period text,typical_floor_collected_at timestamptz,usage_approved_on date,completion_source_url text,completion_collected_at timestamptz,typical_floor_scope text,complex_id uuid,redevelopment_building_id uuid,complex_scope text,component_source_building_id uuid,is_mixed_use boolean);
  create table building_complexes(id uuid primary key default gen_random_uuid(),name text,representative_building_id uuid,gross_area_m2 numeric,area_method text,published boolean default true,area_scope text,common_facts jsonb,parking_spaces integer,contracted_capacity_mw numeric,dual_substation boolean);
  create table building_asset_profiles(id uuid primary key,building_id uuid,owner_name text,ceiling_height_m numeric,lease_span_m numeric,office_area_m2 numeric,retail_area_m2 numeric,office_area_basis text,retail_area_basis text,contractor_name text,architect_name text,views jsonb,green_spaces jsonb,hotels jsonb,amenity_operators jsonb,retail_operators jsonb,subway_connections jsonb,certifications jsonb,site_area_m2 numeric(18,4),floor_area_ratio numeric(12,4),efficiency_pct numeric);
  create table building_register_records(id uuid primary key default gen_random_uuid(),record_kind text,is_current boolean default true,gross_area_m2 numeric,floors_above numeric,floors_below numeric,site_area_m2 numeric,floor_area_ratio numeric,parking_total numeric,parking_indoor_self numeric,parking_outdoor_self numeric,parking_indoor_mechanical numeric,parking_outdoor_mechanical numeric,approval_date date);
  create table building_register_links(building_id uuid,record_id uuid,status text);
  create table private.igis_catalog_publications(building_id uuid,asset_category text);
  create view catalog_buildings as select * from buildings where published;
  create function public.is_public_detail_asset(uuid) returns boolean language sql stable security definer as $$select coalesce((select published from buildings where id=$1),false)$$;
  create function public.public_detail_igis_source(uuid) returns uuid language sql stable as $$select null::uuid$$;
  grant usage on schema public to anon,authenticated;grant execute on all functions in schema public to anon,authenticated;`);
    const prior = await readFile(
      new URL(
        "../migrations/202610140001_public_asset_details.sql",
        import.meta.url,
      ),
      "utf8",
    );
    for (const view of [
      "detail_buildings",
      "detail_building_asset_profiles",
      "detail_building_complexes",
    ]) {
      const definition = prior.match(
        new RegExp(
          `create view public\\.${view} with[\\s\\S]*?grant select on public\\.${view} to anon,authenticated;`,
        ),
      );
      assert(definition);
      await db.exec(definition[0]);
    }
    await db.exec(
      await readFile(
        new URL(
          "../migrations/202610290001_register_overview_connection.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        new URL(
          "../migrations/202610290002_detail_lookup_performance.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const asset = async (scope = null, status = "operating") => {
      const id = (
        await db.query(
          "insert into buildings(complex_scope,status) values($1,$2) returning id",
          [scope, status],
        )
      ).rows[0].id;
      await db.query(
        "insert into building_asset_profiles(id,building_id) values($1,$1)",
        [id],
      );
      return id;
    };
    const record = async (id, kind = "building", status = "verified") => {
      const r = (
        await db.query(
          "insert into building_register_records(record_kind,gross_area_m2,floors_above,floors_below,site_area_m2,floor_area_ratio,parking_indoor_self,parking_outdoor_self,parking_indoor_mechanical,parking_outdoor_mechanical,approval_date) values($1,1000,10,0,100,600,10,5,0,0,'2020-01-02') returning id",
          [kind],
        )
      ).rows[0].id;
      await db.query("insert into building_register_links values($1,$2,$3)", [
        id,
        r,
        status,
      ]);
      return r;
    };
    const facts = async (id) =>
      (
        await db.query(
          "select * from detail_building_register_overview where id=$1",
          [id],
        )
      ).rows[0];
    const shown = async (table, id) =>
      (await db.query(`select * from ${table} where id=$1`, [id])).rows[0];
    const a = await asset(),
      r = await record(a);
    assert.equal(
      Number((await shown("detail_buildings", a)).gross_area_m2),
      1000,
    );
    assert.equal((await shown("detail_buildings", a)).floors_below, 0);
    assert.equal((await shown("detail_buildings", a)).parking_spaces, 15);
    assert.equal((await shown("detail_buildings", a)).completion_year, 2020);
    assert.equal(
      Number((await shown("detail_building_asset_profiles", a)).site_area_m2),
      100,
    );
    assert.equal(
      (await shown("buildings", a)).gross_area_m2,
      null,
      "raw fields remain editable overrides",
    );
    await db.query(
      "update building_register_records set site_area_m2=200,floors_above=11 where id=$1",
      [r],
    );
    assert.equal(
      Number((await shown("detail_building_asset_profiles", a)).site_area_m2),
      200,
      "source refresh is immediate",
    );
    assert.equal((await shown("detail_buildings", a)).floors_above, 11);
    await db.query(
      "update buildings set gross_area_m2=1200,parking_spaces=25,completion_year=2019 where id=$1",
      [a],
    );
    await db.query(
      "update building_asset_profiles set site_area_m2=123,floor_area_ratio=700 where id=$1",
      [a],
    );
    assert.equal(
      Number((await shown("detail_buildings", a)).gross_area_m2),
      1200,
    );
    assert.equal((await shown("detail_buildings", a)).parking_spaces, 25);
    assert.equal(
      (await shown("detail_buildings", a)).usage_approved_on,
      null,
      "conflicting manual year is not silently combined with a different approval year",
    );
    assert.equal(
      Number((await shown("detail_building_asset_profiles", a)).site_area_m2),
      123,
    );
    assert.equal(
      Number(
        (await shown("detail_building_asset_profiles", a)).floor_area_ratio,
      ),
      700,
    );
    assert.equal(
      (await shown("detail_building_asset_profiles", a)).ceiling_height_m,
      null,
    );
    assert.equal(
      (await shown("detail_building_asset_profiles", a)).office_area_m2,
      null,
    );
    assert.equal(
      (await shown("detail_building_asset_profiles", a)).efficiency_pct,
      null,
    );
    const parent = await asset("aggregate"),
      child = await asset("component"),
      empty = await asset("component");
    const c = (
      await db.query(
        "insert into building_complexes(representative_building_id) values($1) returning id",
        [parent],
      )
    ).rows[0].id;
    await db.query("update buildings set complex_id=$1 where id=any($2)", [
      c,
      [parent, child, empty],
    ]);
    await record(parent);
    const cr = await record(child);
    await db.query(
      "update building_register_records set gross_area_m2=300,floors_above=3,site_area_m2=0,floor_area_ratio=0 where id=$1",
      [cr],
    );
    assert.equal(Number((await facts(child)).gross_area_m2), 300);
    assert.equal((await facts(child)).floors_above, 3);
    assert.equal(Number((await facts(child)).site_area_m2), 100);
    assert.equal((await facts(child)).parking_spaces, 15);
    assert.equal(
      (await facts(empty)).gross_area_m2,
      null,
      "an unlinked tower never inherits parent GFA",
    );
    assert.equal((await facts(empty)).floors_above, null);
    assert.equal((await facts(empty)).usage_approved_on, null);
    assert.equal(Number((await facts(empty)).site_area_m2), 100);
    assert.equal(
      (await shown("detail_building_complexes", c)).parking_spaces,
      15,
    );
    await db.query(
      "update building_complexes set parking_spaces=30 where id=$1",
      [c],
    );
    assert.equal(
      (await shown("detail_building_complexes", c)).parking_spaces,
      30,
    );
    const incomplete = await asset("component");
    await record(incomplete);
    const partial = (
      await db.query(
        "insert into building_complexes(representative_building_id) values($1) returning id",
        [incomplete],
      )
    ).rows[0].id;
    await db.query("update buildings set complex_id=$1 where id=$2", [
      partial,
      incomplete,
    ]);
    assert.equal(
      (await facts(incomplete)).site_area_m2,
      null,
      "one tower cannot establish the whole complex site area",
    );
    assert.equal((await facts(incomplete)).parking_spaces, null);
    const candidate = await asset();
    await record(candidate, "building", "candidate");
    assert.equal((await facts(candidate)).gross_area_m2, null);
    const stale = await asset(),
      staleR = await record(stale);
    await db.query(
      "update building_register_records set is_current=false where id=$1",
      [staleR],
    );
    assert.equal((await facts(stale)).gross_area_m2, null);
    const ambiguous = await asset();
    await record(ambiguous);
    await record(ambiguous);
    assert.equal((await facts(ambiguous)).gross_area_m2, null);
    const future = await asset(null, "development");
    await record(future);
    assert.equal((await facts(future)).gross_area_m2, null);
    const zero = await asset(),
      zr = await record(zero);
    await db.query(
      "update building_register_records set parking_indoor_self=0,parking_outdoor_self=0 where id=$1",
      [zr],
    );
    assert.equal((await facts(zero)).parking_spaces, null);
    await db.query(
      "update building_register_records set parking_total=0 where id=$1",
      [zr],
    );
    assert.equal((await facts(zero)).parking_spaces, 0);
    const hidden = await asset();
    await record(hidden);
    await db.query("update buildings set published=false where id=$1", [
      hidden,
    ]);
    await db.exec("set role anon");
    assert.equal(await facts(hidden), undefined);
    assert.equal(
      Number((await shown("detail_buildings", a)).gross_area_m2),
      1200,
    );
    await assert.rejects(
      () => db.query("select * from building_register_records"),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        db.query("update detail_buildings set floors_above=20 where id=$1", [
          a,
        ]),
      /permission denied|cannot update view/,
    );
  } finally {
    await db.close();
  }
});
