import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("source guard preserves own login timestamps but forbids browser changes to staff identity and privileges", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create function auth.uid() returns uuid language sql stable as $$select '10000000-0000-0000-0000-000000000001'::uuid$$;
 grant usage on schema public,auth to anon,authenticated;
 create table iota_seoul_pilot_members(auth_id uuid,email text,is_active boolean,role_code text,last_login_at timestamptz);
 alter table iota_seoul_pilot_members enable row level security;
 grant all on iota_seoul_pilot_members to anon,authenticated;
 create policy all_access on iota_seoul_pilot_members for all using(true) with check(true);
 insert into iota_seoul_pilot_members values('10000000-0000-0000-0000-000000000001','self@test.invalid',true,'manager',null),('10000000-0000-0000-0000-000000000002','other@test.invalid',true,'master',null);`);
    await db.exec(
      await readFile(
        new URL("../../docs/auth/igis-source-guard.sql", import.meta.url),
        "utf8",
      ),
    );
    assert.equal(
      (await db.query("select workplace_identity_guard_ready() ready")).rows[0]
        .ready,
      true,
    );
    for (const role of ["anon", "authenticated"]) {
      await db.exec("reset role;set role " + role);
      await assert.rejects(
        () => db.exec("update iota_seoul_pilot_members set role_code='master'"),
        /permission denied/,
      );
      await assert.rejects(
        () => db.exec("update iota_seoul_pilot_members set is_active=true"),
        /permission denied/,
      );
      await assert.rejects(
        () =>
          db.exec(
            "update iota_seoul_pilot_members set email='forged@test.invalid'",
          ),
        /permission denied/,
      );
      await assert.rejects(
        () => db.exec("delete from iota_seoul_pilot_members"),
        /permission denied/,
      );
    }
    assert.equal(
      (
        await db.query(
          "update iota_seoul_pilot_members set last_login_at=now() returning email",
        )
      ).rows.length,
      1,
    );
    await db.exec(
      "reset role;grant update(auth_id) on iota_seoul_pilot_members to anon;set role anon",
    );
    assert.equal(
      (await db.query("select workplace_identity_guard_ready() ready")).rows[0]
        .ready,
      false,
    );
    await db.exec("reset role");
    for (let i = 0; i < 5; i++)
      assert.equal(
        (await db.query("select consume_igis_auth_attempt('test') ok")).rows[0]
          .ok,
        true,
      );
    assert.equal(
      (await db.query("select consume_igis_auth_attempt('test') ok")).rows[0]
        .ok,
      false,
    );
  } finally {
    await db.close();
  }
});
