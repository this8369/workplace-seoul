import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("gallery order drives the cover, while drafts, plans and other towers remain isolated", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
   create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
   alter table storage.objects enable row level security;
   grant usage on schema public,auth,storage to anon,authenticated; grant select on storage.objects to anon,authenticated; grant insert,delete on storage.objects to authenticated;`);
    for (const name of (
      await readdir(new URL("../migrations/", import.meta.url))
    )
      .filter((x) => x.endsWith(".sql"))
      .sort())
      await db.exec(
        await readFile(
          new URL("../migrations/" + name, import.meta.url),
          "utf8",
        ),
      );

    const uid = "30000000-0000-0000-0000-000000000001",
      east = "10000000-0000-0000-0000-000000000001",
      west = "10000000-0000-0000-0000-000000000002";
    const old = "20000000-0000-0000-0000-000000000001",
      fresh = "20000000-0000-0000-0000-000000000002",
      draft = "20000000-0000-0000-0000-000000000003",
      plan = "20000000-0000-0000-0000-000000000004",
      other = "20000000-0000-0000-0000-000000000005";
    await db.query(
      "insert into auth.users values($1,'reviewer@example.test',now())",
      [uid],
    );
    await db.exec(
      "insert into private.reviewers values('reviewer@example.test')",
    );
    await db.query(
      "select link_igis_identity($1,'40000000-0000-0000-0000-000000000001','14eaf982-9d0d-4243-a0b4-eb10626f690a','Admin','reviewer@example.test')",
      [uid],
    );
    await db.query(
      "insert into buildings(id,name,address,region,status,gross_area_m2,area_basis,source_name) values($1,'East','Test','CBD','operating',40000,'actual','Test'),($2,'West','Test','CBD','operating',40000,'actual','Test')",
      [east, west],
    );
    await db.query(
      "insert into private.catalog_publications(record_type,record_id) values('buildings',$1),('buildings',$2)",
      [east, west],
    );
    const images = [
      [old, east, 2, "photo", "approved"],
      [fresh, east, 1, "photo", "approved"],
      [draft, east, 0, "photo", "candidate"],
      [plan, east, 0, "floor_plan", "approved"],
      [other, west, 0, "photo", "approved"],
    ];
    for (const [id, building, order, kind, status] of images) {
      const path = `${building}/${id}.webp`;
      await db.query(
        "insert into storage.objects(bucket_id,name) values('building-images',$1)",
        [path],
      );
      await db.query(
        "insert into building_images(id,building_id,title,source_name,object_path,thumbnail_path,sort_order,kind,review_status,reviewed_at) values($1,$2,'Test','Test',$3,$3,$4,$5,$6,now())",
        [id, building, path, order, kind, status],
      );
    }
    async function primary(building) {
      return (
        await db.query(
          "select id from building_images where building_id=$1 and is_primary",
          [building],
        )
      ).rows.map((r) => r.id);
    }
    assert.deepEqual(await primary(east), [fresh]);
    assert.deepEqual(await primary(west), [other]);
    await db.exec("set role anon");
    assert.deepEqual(
      (
        await db.query("select id from catalog_images where building_id=$1", [
          east,
        ])
      ).rows,
      [{ id: fresh }],
    );
    await assert.rejects(
      () =>
        db.query("update building_images set sort_order=1 where id=$1", [old]),
      /permission denied/,
    );
    await db.exec("reset role;set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      uid,
    ]);
    await db.query("update building_images set sort_order=0 where id=$1", [
      old,
    ]);
    assert.deepEqual(await primary(east), [old]);
    await db.query("select set_primary_building_image($1)", [fresh]);
    assert.deepEqual(await primary(east), [fresh]);
    assert.deepEqual(
      (
        await db.query(
          "select id,sort_order from building_images where building_id=$1 and review_status='approved' and kind<>'floor_plan' order by sort_order",
          [east],
        )
      ).rows,
      [
        { id: fresh, sort_order: 1 },
        { id: old, sort_order: 2 },
      ],
    );
    await db.query("update building_images set sort_order=3 where id=$1", [
      fresh,
    ]);
    assert.deepEqual(await primary(east), [old]);
    await db.query("select approve_building_image($1,false)", [fresh]);
    assert.deepEqual(await primary(east), [old]);
    await db.query(
      "update building_images set is_primary=false,review_status='rejected' where id=$1",
      [old],
    );
    assert.deepEqual(await primary(east), [fresh]);
    await db.query("delete from building_images where id=$1", [fresh]);
    assert.deepEqual(await primary(east), []);
    assert.deepEqual(await primary(west), [other]);
    await assert.rejects(
      () => db.query("select set_primary_building_image($1)", [plan]),
      /floor_plan_cannot_be_primary/,
    );
  } finally {
    await db.close();
  }
});
