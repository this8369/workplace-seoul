import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("public catalog excludes private fields and future imports; raw details require active, verified membership", async () => {
  const db = new PGlite();
  const bid = "60000000-0000-0000-0000-000000000001";
  const uid = "30000000-0000-0000-0000-000000000001";
  const next = "60000000-0000-0000-0000-000000000002";
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;
      grant usage on schema public,auth,storage to anon,authenticated;
      grant select on storage.objects to anon,authenticated;
      grant insert,delete on storage.objects to authenticated;`);
    const dir = new URL("../migrations/", import.meta.url);
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files.filter((f) => f < "20261012"))
      await db.exec(await readFile(new URL(file, dir), "utf8"));
    await db.query(
      "insert into buildings(id,name,address,region,status,gross_area_m2,area_basis,source_name,overview) values($1,'Public card','Test','CBD','operating',40000,'actual','Test','CONFIDENTIAL_OVERVIEW')",
      [bid],
    );
    await db.query(
      "insert into transactions(building_id,building_name,region,source_name,note) values($1,'Public transaction','CBD','Test','CONFIDENTIAL_NOTE')",
      [bid],
    );
    await db.query(
      "insert into building_facts(building_id,category,field_key,value,as_of,source_name,published) values($1,'ownership','private','\"CONFIDENTIAL_FACT\"',current_date,'Test',true)",
      [bid],
    );
    // Reproduce Supabase's broad defaults on the two newer tables.
    await db.exec(
      "grant truncate,references,trigger on building_parcels,building_places to anon,authenticated",
    );
    for (const file of files.filter((f) => f >= "20261012"))
      await db.exec(await readFile(new URL(file, dir), "utf8"));
    await db.query(
      "insert into buildings(id,name,address,region,status,gross_area_m2,area_basis,source_name,overview) values($1,'New IGIS import','Test','CBD','operating',50000,'actual','Test','PRIVATE_NEW_ASSET')",
      [next],
    );
    await db.exec(
      "alter table buildings add column future_fund_secret text default 'FUND_SECRET'",
    );
    await db.exec("set role anon");
    const publicRows = (await db.query("select * from catalog_buildings")).rows;
    assert.equal(publicRows.length, 1);
    assert.equal(publicRows[0].id, bid);
    for (const column of [
      "overview",
      "source_url",
      "future_fund_secret",
      "parking_spaces",
    ])
      assert.equal(Object.hasOwn(publicRows[0], column), false);
    const trades = (await db.query("select * from catalog_transactions")).rows;
    assert.equal(trades.length, 1);
    assert.equal(Object.hasOwn(trades[0], "note"), false);
    const tables = [
      "buildings",
      "building_facts",
      "companies",
      "transactions",
      "transaction_assets",
      "occupancies",
      "tenant_movements",
      "leasing_quarters",
      "development_records",
      "building_images",
      "building_complexes",
      "building_towers",
      "building_register_records",
      "building_register_links",
      "building_register_floors",
      "building_register_area_parts",
      "building_register_sections",
      "building_parcels",
      "building_places",
    ];
    for (const table of tables)
      await assert.rejects(
        () => db.query(`select * from ${table}`),
        /permission denied/,
        table,
      );
    await assert.rejects(
      () => db.exec("update catalog_buildings set name='Tampered'"),
      /permission denied|cannot update view/,
    );
    await assert.rejects(
      () => db.query("select * from private.catalog_publications"),
      /permission denied/,
    );
    for (const role of ["anon", "authenticated"])
      for (const table of ["building_parcels", "building_places"])
        for (const privilege of ["TRUNCATE", "REFERENCES", "TRIGGER"])
          assert.equal(
            (
              await db.query("select has_table_privilege($1,$2,$3) ok", [
                role,
                table,
                privilege,
              ])
            ).rows[0].ok,
            false,
          );
    await db.exec("reset role");
    await db.query(
      "insert into auth.users values($1,'viewer@test.invalid',now())",
      [uid],
    );
    const asMember = async () => {
      await db.exec("reset role;set role authenticated");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        uid,
      ]);
    };
    await asMember();
    // A valid Auth account without an IGIS employee linkage cannot read details.
    for (const table of tables)
      assert.equal(
        (await db.query(`select * from ${table}`)).rows.length,
        0,
        table,
      );
    await db.exec("reset role");
    await db.query(
      "select link_igis_identity($1,'40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','Viewer','viewer@test.invalid')",
      [uid],
    );
    await asMember();
    assert.equal((await db.query("select * from buildings")).rows.length, 2);
    assert.equal(
      (await db.query("select overview from buildings where id=$1", [bid]))
        .rows[0].overview,
      "CONFIDENTIAL_OVERVIEW",
    );
    assert.equal(
      (await db.query("select note from transactions")).rows[0].note,
      "CONFIDENTIAL_NOTE",
    );
    assert.equal(
      (await db.query("select * from building_facts")).rows.length,
      1,
    );
    await assert.rejects(
      () => db.exec("update buildings set overview='forged'"),
      /permission denied/,
    );
    for (const restriction of [
      "enabled=false",
      "verified_until=now()-interval '1 second'",
      "permissions='{\"details.read\":false}'::jsonb",
    ]) {
      await db.exec("reset role");
      await db.query(
        `update private.workplace_members set enabled=true,verified_until=now()+interval '2 minutes',permissions='{}' where user_id=$1`,
        [uid],
      );
      await db.query(
        `update private.workplace_members set ${restriction} where user_id=$1`,
        [uid],
      );
      await asMember();
      for (const table of tables)
        assert.equal(
          (await db.query(`select * from ${table}`)).rows.length,
          0,
          `${restriction}: ${table}`,
        );
      assert.equal(
        (await db.query("select * from catalog_buildings")).rows.length,
        1,
      );
    }
  } finally {
    await db.close();
  }
});
