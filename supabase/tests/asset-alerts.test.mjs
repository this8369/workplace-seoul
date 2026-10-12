import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("asset alerts isolate accounts, require membership, and reuse permission-filtered history", async () => {
  const db = new PGlite();
  const user = "10000000-0000-0000-0000-000000000001",
    other = "10000000-0000-0000-0000-000000000002",
    asset = "20000000-0000-0000-0000-000000000001";
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth; create schema private;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function public.has_workplace_permission(text) returns boolean language sql stable as $$select coalesce(current_setting('test.member',true),'')='yes'$$;
      create table public.buildings(id uuid primary key,name text);
      create view public.catalog_buildings as select * from public.buildings;
      create table private.data_record_history(id bigint primary key,asset_ids uuid[],changed_at timestamptz default clock_timestamp(),readable boolean default true);
      -- Model the existing history API's per-record permission filtering.
      create function public.data_field_history(asset_key uuid) returns jsonb language sql stable security definer set search_path='' as $$
        select jsonb_build_object('records',coalesce(jsonb_agg(jsonb_build_object('id',id,'changed_at',changed_at)),'[]'))
        from private.data_record_history where asset_key=any(asset_ids) and readable
      $$;
      insert into auth.users values('${user}'),('${other}');
      insert into public.buildings values('${asset}','Test building');
      insert into private.data_record_history(id,asset_ids,changed_at) values(1,array['${asset}']::uuid[],now()-interval '1 day');
      grant usage on schema public,auth to anon,authenticated;
    `);
    await db.exec(
      await readFile(
        new URL("../migrations/202610120017_asset_alerts.sql", import.meta.url),
        "utf8",
      ),
    );
    const scalar = async (sql) => (await db.query(sql)).rows[0].value;
    const actAs = async (id, member = true) => {
      await db.exec("reset role;set role authenticated");
      await db.query(
        "select set_config('request.jwt.claim.sub',$1,false),set_config('test.member',$2,false)",
        [id, member ? "yes" : "no"],
      );
    };
    await db.exec("set role anon");
    await assert.rejects(
      () => db.query("select public.asset_alert_feed()"),
      /permission denied/,
    );
    await actAs(user, false);
    await assert.rejects(
      () => db.query(`select public.set_asset_alert('${asset}',true)`),
      /alert_access_denied/,
    );
    await actAs(user);
    assert.equal(
      await scalar(`select public.set_asset_alert('${asset}',true) as value`),
      true,
    );
    assert.deepEqual(
      await scalar("select public.asset_alert_feed() as value"),
      [],
    );
    await assert.rejects(
      () => db.query("select * from private.asset_alert_subscriptions"),
      /permission denied/,
    );
    await actAs(other);
    assert.equal(
      await scalar(`select public.asset_alert_state('${asset}') as value`),
      false,
    );
    await db.exec(
      `reset role;insert into private.data_record_history(id,asset_ids,readable) values(2,array['${asset}']::uuid[],false)`,
    );
    await actAs(user);
    assert.deepEqual(
      await scalar("select public.asset_alert_feed() as value"),
      [],
      "confidential-only changes must not emit an alert",
    );
    await db.exec(
      `reset role;insert into private.data_record_history(id,asset_ids) values(3,array['${asset}']::uuid[])`,
    );
    await actAs(user);
    let feed = await scalar("select public.asset_alert_feed() as value");
    assert.equal(feed.length, 1);
    assert.equal(feed[0].latest_id, "3");
    assert.equal(feed[0].changes, 1);
    await scalar(`select public.set_asset_alert('${asset}',true) as value`);
    assert.equal(
      (await scalar("select public.asset_alert_feed() as value")).length,
      1,
      "idempotent enable must retain unread changes",
    );
    await actAs(other);
    assert.deepEqual(
      await scalar("select public.asset_alert_feed() as value"),
      [],
    );
    await db.query(`select public.read_asset_alert('${asset}',3)`);
    await actAs(user);
    assert.equal(
      (await scalar("select public.asset_alert_feed() as value")).length,
      1,
      "another account cannot acknowledge this user's alert",
    );
    await db.query(`select public.read_asset_alert('${asset}',3)`);
    assert.deepEqual(
      await scalar("select public.asset_alert_feed() as value"),
      [],
    );
    await actAs(user, false);
    await assert.rejects(
      () => db.query("select public.asset_alert_feed()"),
      /alert_access_denied/,
    );
    await actAs(user);
    assert.equal(
      await scalar(`select public.set_asset_alert('${asset}',false) as value`),
      false,
    );
    assert.equal(
      await scalar(`select public.asset_alert_state('${asset}') as value`),
      false,
    );
    await scalar(`select public.set_asset_alert('${asset}',true) as value`);
    assert.deepEqual(
      await scalar("select public.asset_alert_feed() as value"),
      [],
      "re-enabling starts with future changes",
    );
  } finally {
    await db.close();
  }
});
