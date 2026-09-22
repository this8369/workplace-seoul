import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("approved images are public; candidates, writes and private imports stay protected", async () => {
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
      bid = "10000000-0000-0000-0000-000000000001",
      iid = "20000000-0000-0000-0000-000000000001",
      other = "30000000-0000-0000-0000-000000000002";
    const path = `${bid}/${iid}.webp`;
    await db.query(
      "insert into auth.users values($1,'reviewer@example.test',now()),($2,'other@example.test',now())",
      [uid, other],
    );
    await db.exec(
      "insert into private.reviewers values('reviewer@example.test')",
    );
    await db.query(
      "select link_igis_identity($1,'40000000-0000-0000-0000-000000000001','14eaf982-9d0d-4243-a0b4-eb10626f690a','Admin','reviewer@example.test')",
      [uid],
    );
    await db.query(
      "insert into buildings(id,name,address,region,status,gross_area_m2,area_basis,source_name) values($1,'Test','Test','CBD','operating',40000,'actual','Test')",
      [bid],
    );
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      other,
    ]);
    await assert.rejects(
      () =>
        db.query(
          "insert into building_images(building_id,title,source_name) values($1,'Test','Test')",
          [bid],
        ),
      /row-level security/,
    );
    await assert.rejects(
      () => db.query("select set_primary_building_image($1)", [iid]),
      /reviewer_required/,
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      uid,
    ]);
    await db.query(
      "insert into building_images(id,building_id,title,source_name) values($1,$2,'Test','Test')",
      [iid, bid],
    );
    await assert.rejects(
      () => db.query("select set_primary_building_image($1)", [iid]),
      /image_file_required/,
    );
    await db.query("update building_images set object_path=$1 where id=$2", [
      path,
      iid,
    ]);
    await assert.rejects(
      () => db.query("select set_primary_building_image($1)", [iid]),
      /image_file_missing/,
    );
    await db.query(
      "insert into storage.objects(bucket_id,name) values('building-images',$1)",
      [path],
    );
    await db.query("select set_primary_building_image($1)", [iid]);
    assert.equal(
      (await db.query("select is_primary from building_images")).rows[0]
        .is_primary,
      true,
    );
    await db.exec("reset role;set role anon");
    assert.equal(
      (await db.query("select * from building_images")).rows.length,
      1,
    );
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      1,
    );
    await db.exec(
      "reset role; update buildings set published=true,verified_on=current_date; set role anon",
    );
    assert.equal(
      (await db.query("select * from building_images")).rows.length,
      1,
    );
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      1,
    );
    await db.exec(
      "reset role; update building_images set review_status='candidate',is_primary=false; set role anon",
    );
    assert.equal(
      (await db.query("select * from building_images")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      0,
    );
    await db.exec("reset role");
    const boundary = {
      properties: { key: "CBD", labelPosition: [127, 37] },
      bbox: [126, 36, 128, 38],
      geometry: { type: "MultiPolygon", coordinates: [] },
    };
    await db.query(
      "insert into districts(key,label,name,color,sort_order,membership_boundary,display_boundary) values('CBD','CBD','Test','#253985',1,$1,$1)",
      [JSON.stringify(boundary)],
    );
    await db.exec("set role anon");
    assert.equal(
      (await db.query("select count(*)::int n from districts")).rows[0].n,
      1,
    );
    await assert.rejects(
      () => db.query("update districts set color='#112233'"),
      /permission denied/,
    );
    await db.exec("reset role;set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      other,
    ]);
    assert.equal(
      (await db.query("update districts set color='#112233' returning key"))
        .rows.length,
      0,
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      uid,
    ]);
    assert.equal(
      (await db.query("update districts set color='#112233' returning key"))
        .rows.length,
      1,
    );
    await db.exec("reset role");
    const revisions = (
      await db.query(
        "select previous_record,actor from private.district_revisions",
      )
    ).rows;
    assert.equal(revisions.length, 1);
    assert.equal(revisions[0].previous_record.color, "#253985");
    assert.equal(revisions[0].actor, uid);
    await db.exec("reset role");
    assert.ok(
      (await db.query("select * from private.image_revisions")).rows.length >=
        3,
    );
  } finally {
    await db.close();
  }
});
