import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("component assets keep unknown areas, independent media and synchronized component metrics", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;create schema auth;create schema storage;create table storage.objects(bucket_id text,name text);create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$select null::uuid$$;
 create function public.can_review_records() returns boolean language sql as $$select false$$;
 create function public.has_workplace_permission(text) returns boolean language sql as $$select current_setting('test.member',true)='yes'$$;`);
    for (const f of ["202609180001_core", "202609210005_physical_towers"])
      await db.exec(
        await readFile(
          new URL("../migrations/" + f + ".sql", import.meta.url),
          "utf8",
        ),
      );
    await db.exec(`alter table buildings add column complex_scope text;
 alter table building_towers add column component_kind text default 'building',add column parent_tower_id uuid,add column gross_area_m2 numeric,add column floors_above integer,add column floors_below integer,add column parking_spaces integer,add column contracted_capacity_mw numeric,add column overview text;
 create table building_power_specs(id uuid primary key,contracted_capacity_mw numeric);
 create table building_images(id uuid primary key default gen_random_uuid(),building_id uuid references buildings,object_path text unique,thumbnail_path text unique,focal_x numeric default 50);
 create table private.catalog_publications(record_type text,record_id uuid);
 create view catalog_buildings as select * from buildings where published;
 create view catalog_complexes as select * from building_complexes where published;`);
    await db.exec(
      await readFile(
        new URL(
          "../migrations/202610130014_component_asset_records.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const parent = (
      await db.query(
        "insert into buildings(name,address,region,status,gross_area_m2,area_basis,source_name,verified_on,published) values('Complex','address','GBD','operating',200000,'actual','test',current_date,true) returning id",
      )
    ).rows[0].id;
    const c = (
      await db.query(
        "insert into building_complexes(name,representative_building_id,gross_area_m2,area_method,source_note,published) values('Complex',$1,200000,'aggregate_record','test',true) returning id",
        [parent],
      )
    ).rows[0].id;
    const children = [];
    for (const label of ["East", "West"]) {
      const b = (
        await db.query(
          "insert into buildings(name,address,region,status,gross_area_m2,area_basis,source_name,verified_on,complex_id,complex_scope) values($1,'address','GBD','operating',null,'actual','test',current_date,$2,'component') returning id",
          [label, c],
        )
      ).rows[0].id;
      children.push(b);
      const t = (
        await db.query(
          "insert into building_towers(complex_id,building_id,label,sort_order) values($1,$2,$3,$4) returning id",
          [c, b, label, children.length],
        )
      ).rows[0].id;
      await db.query(
        "insert into private.complex_component_assets(tower_id,building_id,parent_building_id) values($1,$2,$3)",
        [t, b, parent],
      );
      await db.query(
        "insert into private.catalog_publications values('building_towers',$1)",
        [t],
      );
      await db.query("insert into building_power_specs(id) values($1)", [b]);
      await db.query(
        "insert into building_images(building_id,object_path,thumbnail_path) values($1,'shared-original','shared-thumbnail')",
        [b],
      );
    }
    await db.exec(
      await readFile(
        new URL(
          "../migrations/202610130015_component_shared_information.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from buildings where component_source_building_id=$1",
          [parent],
        )
      ).rows[0].n,
      2,
    );
    assert.equal(
      (await db.query("select count(*)::int n from catalog_buildings")).rows[0]
        .n,
      1,
      "single list row retained",
    );
    assert.equal(
      (await db.query("select count(*)::int n from catalog_towers")).rows[0].n,
      2,
      "tower list remains visible",
    );
    await db.query("update buildings set gross_area_m2=50000 where id=$1", [
      children[0],
    ]);
    assert.equal(
      Number(
        (
          await db.query(
            "select gross_area_m2 from building_towers where building_id=$1",
            [children[0]],
          )
        ).rows[0].gross_area_m2,
      ),
      50000,
    );
    assert.equal(
      (
        await db.query("select gross_area_m2 from buildings where id=$1", [
          children[1],
        ])
      ).rows[0].gross_area_m2,
      null,
    );
    await db.query(
      "update building_towers set floors_above=30 where building_id=$1",
      [children[0]],
    );
    assert.equal(
      (
        await db.query("select floors_above from buildings where id=$1", [
          children[0],
        ])
      ).rows[0].floors_above,
      30,
    );
    await db.query(
      "update building_power_specs set contracted_capacity_mw=20 where id=$1",
      [children[0]],
    );
    assert.equal(
      Number(
        (
          await db.query(
            "select contracted_capacity_mw from building_towers where building_id=$1",
            [children[0]],
          )
        ).rows[0].contracted_capacity_mw,
      ),
      20,
    );
    await db.query(
      "update building_images set focal_x=20,object_path='east-replacement' where building_id=$1",
      [children[0]],
    );
    const west = (
      await db.query("select * from building_images where building_id=$1", [
        children[1],
      ])
    ).rows[0];
    assert.equal(Number(west.focal_x), 50);
    assert.equal(west.object_path, "shared-original");
    await db.exec("set role authenticated;set test.member='yes'");
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from buildings where id=any($1::uuid[])",
          [children],
        )
      ).rows[0].n,
      2,
      "verified members can access generated details",
    );
    await db.exec("set test.member='no'");
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from buildings where id=any($1::uuid[])",
          [children],
        )
      ).rows[0].n,
      0,
      "unverified members cannot access generated assets",
    );
    await db.exec("reset role;set role anon");
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from buildings where id=any($1::uuid[])",
          [children],
        )
      ).rows[0].n,
      0,
      "anonymous users cannot access generated assets",
    );
  } finally {
    await db.close();
  }
});
