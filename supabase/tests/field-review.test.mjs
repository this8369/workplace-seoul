import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("field review: fund ownership, request routing, atomic approval, scoped history and access expiry", async () => {
  const db = new PGlite();
  const steward = "30000000-0000-0000-0000-000000000001",
    manager = "30000000-0000-0000-0000-000000000002",
    other = "30000000-0000-0000-0000-000000000003",
    staff = "40000000-0000-0000-0000-000000000002",
    building = "50000000-0000-0000-0000-000000000001";
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema private;
 create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table private.workplace_members(user_id uuid primary key,source_member_id uuid,enabled boolean,verified_until timestamptz,role text,display_name text);
 create function public.has_workplace_permission(feature text) returns boolean language sql stable security definer as $$select coalesce((select enabled and verified_until>now() from private.workplace_members where user_id=auth.uid()),false)$$;
 create table public.buildings(id uuid primary key,name text,address text,gross_area_m2 numeric,published boolean,complex_id uuid);
 create table public.companies(id uuid primary key);create table public.occupancies(id uuid primary key,building_id uuid,company_id uuid);create table public.building_complexes(id uuid primary key);create table public.building_towers(id uuid primary key);
 create table public.building_register_links(id uuid primary key,record_id uuid,building_id uuid,status text);
 create table public.building_register_records(id uuid primary key,building_name text,gross_area_m2 numeric);
 grant usage on schema public,auth to anon,authenticated;`);
    for (const f of [
      "202610120003_internal_master",
      "202610120004_master_related_queries",
      "202610120005_master_source_clarifications",
      "202610120006_field_review_workflow",
      "202610120007_review_member_visibility",
      "202610120018_asset_history_dedup",
      "202610130002_private_asset_operations",
      "202610130003_source_finance_boundary",
    ])
      await db.exec(
        await readFile(
          new URL(`../migrations/${f}.sql`, import.meta.url),
          "utf8",
        ),
      );
    await db.query("insert into auth.users values($1),($2),($3)", [
      steward,
      manager,
      other,
    ]);
    await db.query(
      `insert into private.workplace_members values($1,'809a0b49-37da-40e4-b664-8adc2eba4ad3',true,now()+interval '1 hour','admin','Steward'),($2,$4,true,now()+interval '1 hour','viewer','Manager'),($3,'40000000-0000-0000-0000-000000000003',true,now()+interval '1 hour','viewer','Other')`,
      [steward, manager, other, staff],
    );
    await db.query(
      "insert into public.buildings values($1,'Original','Address',12345.123456,false,null)",
      [building],
    );
    const fund = (
      await db.query(
        "insert into private.master_vehicles(name,source_system) values('Fund one','aurum') returning id",
      )
    ).rows[0].id;
    const registry = "50000000-0000-0000-0000-000000000002";
    await db.query(
      "insert into public.building_register_records values($1,'Official title',12345)",
      [registry],
    );
    await db.query(
      "insert into public.building_register_links values(gen_random_uuid(),$1,$2,'verified')",
      [registry, building],
    );
    const fund2 = (
      await db.query(
        "insert into private.master_vehicles(name,source_system) values('Fund two','aurum') returning id",
      )
    ).rows[0].id;
    const position = (
      await db.query(
        "insert into private.master_beneficiary_positions(vehicle_id,beneficiary_name,commitment_amount,confidential) values($1,'Private investor',9007199254740993.123456,true) returning id",
        [fund],
      )
    ).rows[0].id;
    await db.exec("set role anon");
    await assert.rejects(
      () =>
        db.query("select public.data_field_context($1,$2)", [
          "buildings",
          building,
        ]),
      /permission denied/,
    );
    await db.exec("set role authenticated");
    await assert.rejects(
      () =>
        db.query("select public.data_field_context($1,$2)", [
          "buildings",
          building,
        ]),
      /read_denied/,
    );
    const login = (id) =>
      db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await login(manager);
    assert.equal(
      (
        await db.query("select public.data_field_context($1,$2) value", [
          "master_vehicles",
          fund,
        ])
      ).rows[0].value.can_edit,
      false,
      "HR pending grants nothing",
    );
    await db.exec("reset role");
    await db.query(
      "insert into private.master_team_assignments(vehicle_id,source_member_id,role_kind) values($1,$2,'operation_manager')",
      [fund, staff],
    );
    await db.exec("set role authenticated");
    assert.equal(
      (
        await db.query("select public.data_field_context($1,$2) value", [
          "master_vehicles",
          fund,
        ])
      ).rows[0].value.can_edit,
      true,
    );
    assert.equal(
      (
        await db.query("select public.data_field_context($1,$2) value", [
          "master_vehicles",
          fund2,
        ])
      ).rows[0].value.can_edit,
      false,
    );
    const pos = (
      await db.query("select public.data_field_context($1,$2) value", [
        "master_beneficiary_positions",
        position,
      ])
    ).rows[0].value;
    assert.equal(pos.record.commitment_amount, "9007199254740993.123456");
    await db.query("select public.data_save_field($1,$2,$3,$4,$5,$6)", [
      "master_beneficiary_positions",
      position,
      "commitment_amount",
      JSON.stringify(pos.record.commitment_amount),
      JSON.stringify("9007199254740994.123456"),
      "correct own fund",
    ]);
    await assert.rejects(
      () =>
        db.query(
          "select public.master_save_record('master_vehicles',$1,1,'{\"name\":\"Forged\"}','other fund')",
          [fund2],
        ),
      /write_denied/,
    );
    await assert.rejects(
      () =>
        db.query(
          "select public.master_save_record('master_beneficiary_positions',$1,2,$2,'move fund')",
          [position, { vehicle_id: fund2 }],
        ),
      /immutable/,
    );
    await login(other);
    await assert.rejects(
      () =>
        db.query("select public.data_field_context($1,$2)", [
          "master_beneficiary_positions",
          position,
        ]),
      /read_denied/,
    );
    const ctx = (
      await db.query("select public.data_field_context($1,$2) value", [
        "buildings",
        building,
      ])
    ).rows[0].value;
    assert.equal(ctx.can_edit, false);
    const params = [
      "buildings",
      building,
      "name",
      '"Original"',
      '"Corrected"',
      "official source correction",
      "60000000-0000-0000-0000-000000000001",
    ];
    const request = (
      await db.query(
        "select public.data_submit_request($1,$2,$3,$4,$5,$6,$7) id",
        params,
      )
    ).rows[0].id;
    assert.equal(
      (
        await db.query(
          "select public.data_submit_request($1,$2,$3,$4,$5,$6,$7) id",
          params,
        )
      ).rows[0].id,
      request,
      "retry is idempotent",
    );
    const own = (await db.query("select public.data_review_inbox() value"))
      .rows[0].value;
    assert.equal(own.requests.length, 1);
    assert.equal(own.requests[0].recipients.length, 3);
    await assert.rejects(
      () =>
        db.query("select public.data_decide_request($1,true,$2)", [
          request,
          "self approve",
        ]),
      /write_denied/,
    );
    await login(manager);
    assert.equal(
      (await db.query("select public.data_review_inbox() value")).rows[0].value
        .requests.length,
      0,
      "other requester hidden",
    );
    await login(steward);
    const official = (
      await db.query(
        "select public.data_field_context('building_register_records',$1) value",
        [registry],
      )
    ).rows[0].value;
    assert.equal(official.read_only, true);
    assert.equal(
      official.can_edit,
      false,
      "even planning team cannot edit the official register",
    );
    await assert.rejects(
      () =>
        db.query(
          "select public.data_save_field('building_register_records',$1,'building_name','\"Official title\"','\"Manual\"','manual change')",
          [registry],
        ),
      /official_register_read_only/,
    );
    await assert.rejects(
      () =>
        db.query(
          "select public.data_submit_request('building_register_records',$1,'building_name','\"Official title\"','\"Manual\"','manual change',$2)",
          [registry, "60000000-0000-0000-0000-000000000098"],
        ),
      /official_register_read_only/,
    );
    await db.query("select public.data_decide_request($1,true,$2)", [
      request,
      "source verified",
    ]);
    assert.equal(
      (
        await db.query("select public.data_field_context($1,$2) value", [
          "buildings",
          building,
        ])
      ).rows[0].value.record.name,
      "Corrected",
    );
    await assert.rejects(
      () =>
        db.query("select public.data_decide_request($1,true,$2)", [
          request,
          "duplicate approval",
        ]),
      /not_pending/,
    );
    await login(other);
    const hist = (
      await db.query(
        "select public.data_field_history($1,$2,$3,null,0) value",
        ["buildings", building, "name"],
      )
    ).rows[0].value.records;
    assert(hist.some((h) => h.changes.name.after === "Corrected"));
    assert(hist.every((h) => Object.keys(h.changes).length === 1));
    const assetHistory = (
      await db.query(
        "select public.data_field_history(null,null,null,$1,0) value",
        [building],
      )
    ).rows[0].value;
    assert(assetHistory.records.length > 0);
    assert(
      assetHistory.records.every(
        (h) =>
          h.record_id === building ||
          h.record_id === registry ||
          h.entity === "building_register_links",
      ),
      "asset history excludes unrelated fund changes",
    );
    assert.equal(
      (
        await db.query(
          "select public.data_submit_request($1,$2,$3,$4,$5,$6,$7) id",
          params,
        )
      ).rows[0].id,
      request,
      "response retry after approval returns the same request",
    );
    await assert.rejects(
      () =>
        db.query(
          "select public.data_submit_request($1,$2,$3,$4,$5,$6,$7)",
          params.map((p, i) => (i === 4 ? '"Different"' : p)),
        ),
      /nonce_conflict/,
    );
    await assert.rejects(
      () =>
        db.query(
          "select public.data_submit_request('buildings',$1,'published','true','false','hide record',$2)",
          [building, "60000000-0000-0000-0000-000000000099"],
        ),
      /invalid_field/,
    );
    const second = (
      await db.query(
        "select public.data_submit_request('buildings',$1,'name','\"Corrected\"','\"Pending\"','new proposal',$2) id",
        [building, "60000000-0000-0000-0000-000000000003"],
      )
    ).rows[0].id;
    assert.equal(
      (
        await db.query(
          "select public.data_field_context('buildings',$1) value",
          [building],
        )
      ).rows[0].value.record.name,
      "Corrected",
      "request does not mutate the source",
    );
    await login(steward);
    await db.query(
      "select public.data_save_field('buildings',$1,'name','\"Corrected\"','\"More recent\"','fresh verified source')",
      [building],
    );
    await assert.rejects(
      () =>
        db.query("select public.data_decide_request($1,true,$2)", [
          second,
          "approve stale",
        ]),
      /revision_conflict/,
    );
    assert.equal(
      (
        await db.query("select public.data_review_inbox() value")
      ).rows[0].value.requests.find((r) => r.id === second).status,
      "pending",
      "failed approval remains pending",
    );
    await db.query("select public.data_decide_request($1,false,$2)", [
      second,
      "superseded by newer evidence",
    ]);
    assert.equal(
      (
        await db.query(
          "select public.data_field_context('buildings',$1) value",
          [building],
        )
      ).rows[0].value.record.name,
      "More recent",
      "reject does not overwrite current data",
    );
    await db.exec("reset role");
    const asset = (
      await db.query(
        "insert into private.master_assets(name,existing_building_id) values('More recent',$1) returning id",
        [building],
      )
    ).rows[0].id;
    await db.exec("set role authenticated");
    await db.query(
      "select public.master_save_record('master_assets',$1,1,'{\"name\":\"Canonical correction\"}','MY verified correction')",
      [asset],
    );
    assert.equal(
      (
        await db.query(
          "select public.data_field_context('buildings',$1) value",
          [building],
        )
      ).rows[0].value.record.name,
      "Canonical correction",
    );
    await db.query(
      "select public.data_save_field('buildings',$1,'name','\"Canonical correction\"','\"Approved projection\"','verified for public display')",
      [building],
    );
    assert.equal(
      (
        await db.query("select public.master_asset_corrections($1) value", [
          building,
        ])
      ).rows[0].value.asset.name,
      "Approved projection",
      "approved public correction also updates canonical value",
    );
    const historyFor = async (assetKey) =>
      (
        await db.query(
          "select public.data_field_history(null,null,null,$1,0) value",
          [assetKey],
        )
      ).rows[0].value.records;
    const previous = (await historyFor(building)).filter(
      (h) => h.reason === "verified for public display",
    );
    assert.equal(
      previous.length,
      2,
      "different before-values are distinct changes, not duplicates",
    );
    await db.query(
      "select public.data_save_field('buildings',$1,'name','\"Approved projection\"','\"Approved projection (English)\"','add English name')",
      [building],
    );
    const unified = (await historyFor(building)).filter(
      (h) => h.reason === "add English name",
    );
    assert.equal(
      unified.length,
      1,
      "a synchronized name edit is shown once in the asset timeline",
    );
    assert.equal(
      unified[0].changes.name.after,
      "Approved projection (English)",
    );
    for (const [entity, id] of [
      ["buildings", building],
      ["master_assets", asset],
    ]) {
      const records = (
        await db.query(
          "select public.data_field_history($1,$2,'name',null,0) value",
          [entity, id],
        )
      ).rows[0].value.records;
      assert.equal(
        records.filter((h) => h.reason === "add English name").length,
        1,
        "each source record retains its audit entry",
      );
    }
    // Later edits with the same actor/reason must remain separate.
    await db.query(
      "select public.data_save_field('buildings',$1,'name','\"Approved projection (English)\"','\"Approved projection (Revised)\"','add English name')",
      [building],
    );
    assert.equal(
      (await historyFor(building)).filter(
        (h) => h.reason === "add English name",
      ).length,
      2,
    );
    await db.exec("reset role");
    await db.query(
      "update private.master_team_assignments set valid_to=current_date-1 where source_member_id=$1",
      [staff],
    );
    await db.exec("set role authenticated");
    await login(manager);
    assert.equal(
      (
        await db.query(
          "select public.data_field_context('master_vehicles',$1) value",
          [fund],
        )
      ).rows[0].value.can_edit,
      false,
      "expired assignment stops direct editing",
    );
    await login(other);
    await assert.rejects(
      () =>
        db.query(
          "select public.data_submit_request($1,$2,$3,$4,$5,$6,$7)",
          params.slice(0, 6).concat("60000000-0000-0000-0000-000000000002"),
        ),
      /revision_conflict/,
    );
    await assert.rejects(
      () => db.query("select * from private.data_record_history"),
      /permission denied/,
    );
    await db.exec("reset role");
    await assert.rejects(
      () => db.exec("update private.data_record_history set reason='erase'"),
      /immutable/,
    );
    await db.query(
      "update private.workplace_members set verified_until=now()-interval '1 second' where user_id=$1",
      [other],
    );
    await db.exec("set role authenticated");
    await assert.rejects(
      () =>
        db.query("select public.data_field_history($1,$2,null,null,0)", [
          "buildings",
          building,
        ]),
      /read_denied/,
    );
  } finally {
    await db.close();
  }
});
