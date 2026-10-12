import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("internal master: permission boundary, exact decimals, audited edits and concurrent-write protection", async () => {
  const db = new PGlite();
  const admin = "30000000-0000-0000-0000-000000000001",
    viewer = "30000000-0000-0000-0000-000000000002";
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table private.workplace_members(user_id uuid primary key,enabled boolean,verified_until timestamptz,role text,display_name text);
      create function public.has_workplace_permission(feature text) returns boolean language sql stable security definer as $$select coalesce((select enabled and verified_until>now() from private.workplace_members where user_id=auth.uid()),false)$$;
      create table public.buildings(id uuid primary key);create table public.companies(id uuid primary key);
      create table public.occupancies(id uuid primary key);create table public.building_complexes(id uuid primary key);create table public.building_towers(id uuid primary key);
      grant usage on schema public,auth to anon,authenticated;`);
    await db.exec(
      await readFile(
        new URL(
          "../migrations/202610120003_internal_master.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        new URL(
          "../migrations/202610120004_master_related_queries.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(`
      insert into private.master_beneficiary_positions(id,source_system,source_exported_on,currency_status,commitment_amount)
      values('40000000-0000-0000-0000-000000000001','aurum','2026-10-06','source_unit_unstated',123456.123456),
            ('40000000-0000-0000-0000-000000000002','aurum','2026-10-06','source_unit_unstated',100);
      update private.master_beneficiary_positions set currency_code='USD' where id='40000000-0000-0000-0000-000000000002';
      insert into private.master_aum_snapshots(id,source_system,source_exported_on,aum_entered_on,business_as_of_status)
      values('40000000-0000-0000-0000-000000000003','aurum','2026-10-06','2026-08-31','needs_confirmation');
    `);
    await db.exec(
      await readFile(
        new URL(
          "../migrations/202610120005_master_source_clarifications.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const clarified = (
      await db.query(
        "select currency_code,currency_status,commitment_amount::text,revision from private.master_beneficiary_positions where id='40000000-0000-0000-0000-000000000001'",
      )
    ).rows[0];
    assert.equal(clarified.currency_code, "KRW");
    assert.equal(clarified.currency_status, "inferred_krw_cross_report");
    assert.equal(clarified.commitment_amount, "123456.123456");
    assert.equal(Number(clarified.revision), 2);
    assert.equal(
      (
        await db.query(
          "select currency_code from private.master_beneficiary_positions where id='40000000-0000-0000-0000-000000000002'",
        )
      ).rows[0].currency_code,
      "USD",
    );
    const dateClarification = (
      await db.query(
        "select aum_entered_on::text,business_as_of,business_as_of_status,entered_on_interpretation from private.master_aum_snapshots where id='40000000-0000-0000-0000-000000000003'",
      )
    ).rows[0];
    assert.equal(dateClarification.aum_entered_on, "2026-08-31");
    assert.equal(dateClarification.business_as_of, null);
    assert.equal(
      dateClarification.entered_on_interpretation,
      "system_entry_date_provisional",
    );
    await db.query("insert into auth.users values($1),($2)", [admin, viewer]);
    await db.query(
      "insert into private.workplace_members values($1,true,now()+interval '1 hour','admin','Test Admin'),($2,true,now()+interval '1 hour','viewer','Test Viewer')",
      [admin, viewer],
    );
    await db.exec("set role anon");
    await assert.rejects(
      () => db.query("select public.master_list_records('master_vehicles')"),
      /permission denied/,
    );
    await assert.rejects(
      () => db.query("select * from private.master_vehicles"),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        db.query(
          "select public.master_asset_corrections('40000000-0000-0000-0000-000000000001')",
        ),
      /permission denied/,
    );
    await db.exec("set role authenticated");
    await assert.rejects(
      () => db.query("select public.master_list_records('master_vehicles')"),
      /master_read_denied/,
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      viewer,
    ]);
    assert.deepEqual(
      (
        await db.query(
          "select public.master_list_records('master_vehicles') value",
        )
      ).rows[0].value.records,
      [],
    );
    await assert.rejects(
      () =>
        db.query(
          "select public.master_save_record('master_vehicles',null,null,'{\"name\":\"Denied\"}','test edit')",
        ),
      /master_write_denied/,
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      admin,
    ]);
    await assert.rejects(
      () =>
        db.query(
          "select public.master_list_records('master_vehicles','',null,0)",
        ),
      /invalid_page/,
    );
    const created = (
      await db.query(
        "select public.master_save_record('master_vehicles',null,null,$1,'create test') value",
        [
          {
            name: "Test vehicle",
            source_asset_summary: "Test source",
            source_beneficiary_summary: "Confidential identity",
          },
        ],
      )
    ).rows[0].value;
    const updated = (
      await db.query(
        "select public.master_save_record('master_vehicles',$1,1,$2,'correct name') value",
        [created.id, { name: "Changed" }],
      )
    ).rows[0].value;
    assert.equal(updated.revision, 2);
    await assert.rejects(
      () =>
        db.query(
          "select public.master_save_record('master_vehicles',$1,1,$2,'stale edit')",
          [created.id, { name: "Stale" }],
        ),
      /revision_conflict/,
    );
    await assert.rejects(
      () =>
        db.query(
          "select public.master_save_record('master_vehicles',$1,2,$2,'bad field')",
          [created.id, { source_code: "overwrite" }],
        ),
      /immutable_or_review_only_field/,
    );
    await assert.rejects(
      () =>
        db.query(
          "select public.master_save_record('workplace_members',null,null,'{}','escalate role')",
        ),
      /invalid_entity_type/,
    );
    const h = (
      await db.query(
        "select public.master_record_history('master_vehicles',$1) value",
        [created.id],
      )
    ).rows[0].value;
    assert.equal(h.length, 2);
    assert.equal(h[0].before_record.name, "Test vehicle");
    assert.equal(h[0].after_record.name, "Changed");
    assert.equal(h[0].changed_by, admin);
    assert.equal(h[0].change_origin, "my");
    assert.equal(h[0].changed_by_name, "Test Admin");
    assert.equal(
      (
        await db.query(
          "select public.master_query_records('master_vehicles','',30,0,$1,null) value",
          [created.id],
        )
      ).rows[0].value.records.length,
      1,
    );
    assert.equal(
      (
        await db.query(
          "select public.master_query_records('master_vehicles','',30,0,$1,null) value",
          [viewer],
        )
      ).rows[0].value.records.length,
      0,
    );
    await assert.rejects(
      () =>
        db.query(
          "select public.master_query_records('master_vehicles','',null,0,null,null)",
        ),
      /invalid_page/,
    );
    const loan = (
      await db.query(
        "select public.master_save_record('master_loan_positions',null,null,$1,'precision test') value",
        [
          {
            commitment_amount: "9007199254740993.123456",
            lender_name: "Test lender",
          },
        ],
      )
    ).rows[0].value;
    assert.equal(loan.commitment_amount, "9007199254740993.123456");
    await db.query(
      "select public.master_save_record('master_beneficiary_positions',null,null,$1,'private test')",
      [{ beneficiary_name: "Private investor", confidential: true }],
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      viewer,
    ]);
    const list = (
      await db.query(
        "select public.master_list_records('master_vehicles') value",
      )
    ).rows[0].value.records;
    assert.equal(list[0].source_beneficiary_summary, undefined);
    assert.equal(
      (
        await db.query(
          "select public.master_list_records('master_vehicles','Confidential identity') value",
        )
      ).rows[0].value.records.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select public.master_list_records('master_beneficiary_positions') value",
        )
      ).rows[0].value.records.length,
      0,
    );
    await assert.rejects(
      () =>
        db.query("select public.master_record_history('master_vehicles',$1)", [
          created.id,
        ]),
      /master_history_denied/,
    );
    await db.exec("reset role");
    await assert.rejects(
      () =>
        db.exec(
          "update private.master_change_history set change_reason='erased'",
        ),
      /immutable_source_or_history/,
    );
    await db.query(
      "update private.workplace_members set verified_until=now()-interval '1 second' where user_id=$1",
      [viewer],
    );
    await db.exec("set role authenticated");
    await assert.rejects(
      () => db.query("select public.master_list_records('master_vehicles')"),
      /master_read_denied/,
    );
  } finally {
    await db.close();
  }
});
