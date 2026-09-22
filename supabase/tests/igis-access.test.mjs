import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("IGIS linkage separates read/edit/admin; denies forged, expired, disabled and self-escalated access", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant usage on schema public,auth,storage to anon,authenticated;
 grant select on storage.objects to anon,authenticated;grant insert,delete on storage.objects to authenticated;`);
    for (const f of (await readdir(new URL("../migrations/", import.meta.url)))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(
        await readFile(new URL("../migrations/" + f, import.meta.url), "utf8"),
      );
    const viewer = "30000000-0000-0000-0000-000000000001",
      admin = "30000000-0000-0000-0000-000000000002",
      source = "40000000-0000-0000-0000-000000000001",
      member = "50000000-0000-0000-0000-000000000001",
      bid = "60000000-0000-0000-0000-000000000001";
    await db.query(
      "insert into auth.users values($1,'viewer@test.invalid',now()),($2,'admin@test.invalid',now())",
      [viewer, admin],
    );
    await db.exec(
      "insert into private.reviewers values('viewer@test.invalid')",
    );
    const designated = [
      "14eaf982-9d0d-4243-a0b4-eb10626f690a",
      "55f871a3-8d79-42fb-b208-9515b7b366be",
      "809a0b49-37da-40e4-b664-8adc2eba4ad3",
    ];
    assert.deepEqual(
      (
        await db.query(
          "select source_member_id from private.workplace_initial_roles where role='admin' order by source_member_id",
        )
      ).rows.map((r) => r.source_member_id),
      designated,
    );
    // Every designated employee gets admin on first login, even if their name/email changes.
    for (const [i, id] of designated.entries()) {
      const target =
        i === 0 ? admin : `30000000-0000-0000-0000-00000000001${i}`;
      const sourceId = `40000000-0000-0000-0000-00000000001${i}`;
      if (i > 0)
        await db.query("insert into auth.users values($1,$2,now())", [
          target,
          `admin${i}@test.invalid`,
        ]);
      await db.query(
        "select link_igis_identity($1,$2,$3,'Changed display name',$4)",
        [target, sourceId, id, `admin${i}@test.invalid`],
      );
      assert.equal(
        (
          await db.query(
            "select role from private.workplace_members where user_id=$1",
            [target],
          )
        ).rows[0].role,
        "admin",
      );
    }
    await db.query(
      "select link_igis_identity($1,$2,$3,'Viewer','viewer@test.invalid')",
      [viewer, source, member],
    );
    await db.query(
      "insert into buildings(id,name,address,region,status,gross_area_m2,area_basis,source_name) values($1,'Draft','Test','CBD','operating',40000,'actual','Test')",
      [bid],
    );
    await db.query(
      "insert into transactions(building_id,building_name,region,source_name) values($1,'Draft transaction','CBD','Test')",
      [bid],
    );
    await db.exec("set role anon");
    assert.equal((await db.query("select * from buildings")).rows.length, 1);
    assert.equal((await db.query("select * from transactions")).rows.length, 1);
    await assert.rejects(
      () => db.query("select * from favorites"),
      /permission denied/,
    );
    await assert.rejects(
      () => db.query("select * from private.source_snapshots"),
      /permission denied/,
    );
    await assert.rejects(
      () => db.query("update buildings set name='Forged'"),
      /permission denied/,
    );
    await db.exec("reset role");
    const asUser = async (id) => {
      await db.exec("reset role;set role authenticated");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
    };
    const allowed = async (key) =>
      (await db.query("select has_workplace_permission($1) ok", [key])).rows[0]
        .ok;
    const legacy = "30000000-0000-0000-0000-000000000099";
    await db.query(
      "insert into auth.users values($1,'legacy@test.invalid',now())",
      [legacy],
    );
    await db.exec(
      "insert into private.reviewers values('legacy@test.invalid')",
    );
    await asUser(legacy);
    assert.equal(await allowed("catalog.read"), true);
    assert.equal(await allowed("images.manage"), false);
    assert.equal(await allowed("users.manage"), false);
    await asUser(admin);
    const secondAdmin = "30000000-0000-0000-0000-000000000011";
    await db.query("select set_workplace_access($1,'viewer',true)", [
      secondAdmin,
    ]);
    await db.exec("reset role");
    await db.query(
      "select link_igis_identity($1,'40000000-0000-0000-0000-000000000011',$2,'Changed','changed@test.invalid')",
      [secondAdmin, designated[1]],
    );
    await asUser(secondAdmin);
    assert.equal(await allowed("images.manage"), false);
    assert.equal(await allowed("users.manage"), false);
    // A legacy reviewer email or an identical display name cannot acquire admin.
    await db.exec("reset role");
    await db.query(
      "select link_igis_identity($1,$2,$3,'전기영','viewer@test.invalid')",
      [viewer, source, member],
    );
    await asUser(viewer);
    assert.equal((await db.query("select * from buildings")).rows.length, 1);
    assert.equal(await allowed("images.manage"), false);
    assert.equal(await allowed("users.manage"), false);
    await assert.rejects(
      () => db.query("select * from private.workplace_initial_roles"),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        db.query(
          "select link_igis_identity($1,$2,$3,'Fake','viewer@test.invalid')",
          [viewer, source, member],
        ),
      /permission denied/,
    );
    await assert.rejects(
      () => db.query("select set_workplace_access($1,'admin',true)", [viewer]),
      /admin_required/,
    );
    await assert.rejects(
      () =>
        db.query(
          "insert into building_images(building_id,title,source_name) values($1,'Test','Test')",
          [bid],
        ),
      /row-level security/,
    );
    await assert.rejects(
      () => db.query("select set_primary_building_image($1)", [bid]),
      /reviewer_required/,
    );
    await asUser(admin);
    assert.equal(await allowed("images.manage"), true);
    assert.equal(await allowed("users.manage"), true);
    await db.query("select set_workplace_access($1,'editor',true)", [viewer]);
    await asUser(viewer);
    assert.equal(await allowed("images.manage"), true);
    assert.equal(await allowed("users.manage"), false);
    await db.query(
      "insert into building_images(building_id,title,source_name) values($1,'Test','Test')",
      [bid],
    );
    await db.exec("reset role");
    await db.query(
      "select link_igis_identity($1,$2,$3,'Updated','viewer@test.invalid')",
      [viewer, source, member],
    );
    assert.equal(
      (
        await db.query(
          "select role from private.workplace_members where user_id=$1",
          [viewer],
        )
      ).rows[0].role,
      "editor",
    );
    await assert.rejects(
      () =>
        db.query(
          "select link_igis_identity($1,$2,$3,'Fake','viewer@test.invalid')",
          [viewer, admin, member],
        ),
      /identity_mismatch/,
    );
    await asUser(admin);
    await db.query(
      "select set_workplace_access($1,'editor',true,'{\"images.manage\":false,\"transactions.read\":false}')",
      [viewer],
    );
    await asUser(viewer);
    assert.equal(await allowed("images.manage"), false);
    assert.equal(await allowed("transactions.read"), true);
    assert.equal(await allowed("catalog.read"), true);
    await db.exec("reset role");
    await db.query(
      "update private.workplace_members set verified_until=now()-interval '1 second' where user_id=$1",
      [viewer],
    );
    await asUser(viewer);
    assert.equal((await db.query("select * from buildings")).rows.length, 1);
    assert.equal(await allowed("catalog.read"), true);
    await db.exec("reset role");
    await db.query(
      "select link_igis_identity($1,$2,$3,'Viewer','viewer@test.invalid')",
      [viewer, source, member],
    );
    await asUser(admin);
    await db.query("select set_workplace_access($1,'admin',false)", [viewer]);
    await asUser(viewer);
    assert.equal(await allowed("catalog.read"), true);
    assert.equal(await allowed("users.manage"), false);
    await asUser(admin);
    await assert.rejects(
      () => db.query("select set_workplace_access($1,'viewer',false)", [admin]),
      /cannot_change_own_access/,
    );
    await db.exec("reset role");
  } finally {
    await db.close();
  }
});
