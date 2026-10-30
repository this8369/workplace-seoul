import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("overview topics preserve evidence, share complex fields, prevent duplicates and enforce audited edit permissions", async () => {
  const db = new PGlite();
  const steward = "30000000-0000-0000-0000-000000000001",
    viewer = "30000000-0000-0000-0000-000000000002";
  const a = "50000000-0000-0000-0000-000000000001",
    b = "50000000-0000-0000-0000-000000000002",
    other = "50000000-0000-0000-0000-000000000003",
    hidden = "50000000-0000-0000-0000-000000000004",
    complex = "60000000-0000-0000-0000-000000000001";
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema private;
  create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create table private.workplace_members(user_id uuid primary key,source_member_id uuid,enabled boolean,verified_until timestamptz,role text,display_name text);
  create function public.has_workplace_permission(feature text) returns boolean language sql stable security definer as $$select coalesce((select enabled and verified_until>now() from private.workplace_members where user_id=auth.uid()),false)$$;
  create table public.buildings(id uuid primary key,name text,address text,gross_area_m2 numeric,published boolean,complex_id uuid,latitude numeric,longitude numeric);
  create table public.companies(id uuid primary key);create table public.occupancies(id uuid primary key,building_id uuid,company_id uuid);
  create table public.building_complexes(id uuid primary key,representative_building_id uuid,published boolean);
  create table public.building_towers(id uuid primary key,complex_id uuid);
  create table public.building_register_links(id uuid primary key,record_id uuid,building_id uuid,status text);
  create table public.building_register_records(id uuid primary key,building_name text,gross_area_m2 numeric);
  create table public.building_facts(id uuid primary key default gen_random_uuid(),building_id uuid not null references buildings(id),category text not null,field_key text not null,value jsonb not null,unit text,as_of date,source_name text not null,source_url text,published boolean default false,created_at timestamptz default now());
  create function public.is_public_detail_asset(asset_key uuid) returns boolean language sql stable security definer as $$select coalesce((select published from public.buildings where id=asset_key),false)$$;
  grant usage on schema public,auth to anon,authenticated;`);
    for (const name of [
      "202610120003_internal_master",
      "202610120004_master_related_queries",
      "202610120005_master_source_clarifications",
      "202610120006_field_review_workflow",
      "202610120007_review_member_visibility",
      "202610130004_asset_overview",
      "202610130009_complex_fact_scope",
    ])
      await db.exec(
        await readFile(
          new URL(`../migrations/${name}.sql`, import.meta.url),
          "utf8",
        ),
      );
    await db.query("insert into auth.users values($1),($2)", [steward, viewer]);
    await db.query(
      "insert into private.workplace_members values($1,'809a0b49-37da-40e4-b664-8adc2eba4ad3',true,now()+interval '1 hour','admin','Steward'),($2,'40000000-0000-0000-0000-000000000002',true,now()+interval '1 hour','viewer','Viewer')",
      [steward, viewer],
    );
    await db.query("insert into building_complexes values($1,$2,true)", [
      complex,
      a,
    ]);
    await db.query(
      "insert into buildings values($1,'East','Address',100,true,$5,37,127),($2,'West','Address',200,true,$5,37,127),($3,'Other','Address',300,true,null,37,127),($4,'Hidden','Address',400,false,null,37,127)",
      [a, b, other, hidden, complex],
    );
    const source = [];
    for (const [building, label, value, unit] of [
      [a, "비교표 · 메일룸", "O", null],
      [b, "비교표 · 메일룸", "O", null],
      [a, "비교표 · 웰니스 · 피트니스", "Gym", null],
      [a, "비교표 · 기준층 전용면적", 500, "평"],
      [a, "비교표 · 연면적", 1000, "평"],
      [a, "비교표 · 옥상정원(스카이라운지)", false, null],
      [a, "비교표 · 리테일 · 은행", 0, "개"],
      [a, "비교표 · 기사 대기실", "미확인", null],
      [a, "비교표 · 적용 범위", "내부 범위", null],
      [hidden, "비교표 · 비밀시설", "secret", null],
    ]) {
      const {
        rows: [row],
      } = await db.query(
        "insert into building_facts(building_id,category,field_key,value,unit,source_name,published) values($1,'amenity',$2,$3,$4,'Original evidence',true) returning *",
        [building, label, JSON.stringify(value), unit],
      );
      source.push(row);
    }
    const historyBefore = (
      await db.query("select count(*)::int n from private.data_record_history")
    ).rows[0].n;
    await db.exec(
      await readFile(
        new URL(
          "../migrations/202610300003_overview_topics.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from private.data_record_history",
        )
      ).rows[0].n,
      historyBefore,
      "promotion metadata must not create fake value changes",
    );
    for (const original of source) {
      const {
        rows: [now],
      } = await db.query("select * from building_facts where id=$1", [
        original.id,
      ]);
      for (const key of [
        "id",
        "field_key",
        "value",
        "source_name",
        "building_id",
        "unit",
        "as_of",
        "created_at",
      ])
        assert.deepEqual(now[key], original[key], key);
    }
    const fields = async (id) =>
      (await db.query("select asset_overview_fields($1) v", [id])).rows[0].v;
    await db.exec("set role anon");
    const east = await fields(a),
      west = await fields(b);
    assert.deepEqual(east, west);
    assert.equal(east.items.length, 4);
    assert.equal(
      east.items.find((x) => x.label === "옥상정원·스카이라운지").value,
      false,
    );
    assert.equal(east.items.find((x) => x.label === "은행").value, 0);
    assert(!east.items.some((x) => /연면적|기준층|범위|대기실/.test(x.label)));
    assert(!east.topics.some((x) => x.label === "비밀시설"));
    await assert.rejects(() => fields(hidden), /asset_not_found/);
    await assert.rejects(
      () => db.query("select * from asset_overview_topics"),
      /permission denied/,
    );
    const add = (id, name, value, unit = null) =>
      db.query("select asset_overview_add_item($1,$2,$3,$4,'근거 확인') v", [
        id,
        name,
        JSON.stringify(value),
        unit,
      ]);
    await assert.rejects(() => add(a, "회의실", 1), /permission denied/);
    await db.exec("set role authenticated");
    const login = (id) =>
      db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await login(viewer);
    await assert.rejects(() => add(a, "회의실", 1), /denied/);
    await login(steward);
    await assert.rejects(
      () => add(a, "기준층 전용 면적", 999),
      /overview_standard_topic/,
    );
    await assert.rejects(
      () => add(a, "헬스 장", "Other"),
      /overview_item_exists/,
    );
    const {
      rows: [{ v: newItem }],
    } = await add(b, "미팅 룸", 2, "개");
    assert.equal(newItem.building_id, a);
    assert.equal(newItem.complex_id, complex);
    assert.equal(
      (await add(a, "미팅룸", 2, "개")).rows[0].v.id,
      newItem.id,
      "identical retry is idempotent",
    );
    await assert.rejects(
      () => add(a, "미팅룸", 3, "개"),
      /overview_item_exists/,
    );
    const second = (await add(other, "미팅룸", 0, "개")).rows[0].v;
    assert.equal(second.overview_topic_code, newItem.overview_topic_code);
    await assert.rejects(() => add(a, "빈값", " "), /invalid_overview_value/);
    await assert.rejects(() => add(a, "객체", {}), /invalid_overview_value/);
    await assert.rejects(() => add(a, "---", 1), /invalid_overview_value/);
    await assert.rejects(
      () =>
        db.query("update building_facts set value='4' where id=$1", [
          newItem.id,
        ]),
      /permission denied/,
    );
    const context = async (id) =>
      (await db.query("select data_field_context('building_facts',$1) v", [id]))
        .rows[0].v;
    const ctx = await context(newItem.id);
    assert.equal(ctx.can_edit, true);
    assert.equal(ctx.record.name, "미팅 룸");
    assert(
      !ctx.fields.some((f) =>
        ["overview_enabled", "overview_topic_code"].includes(f.key),
      ),
    );
    const save = (id, expected, proposed) =>
      db.query(
        "select data_save_field('building_facts',$1,'value',$2,$3,'현장 확인')",
        [id, JSON.stringify(expected), JSON.stringify(proposed)],
      );
    await save(newItem.id, 2, 3);
    await assert.rejects(() => save(newItem.id, 2, 4), /revision_conflict/);
    assert.equal(
      (await fields(b)).items.find((x) => x.id === newItem.id).value,
      3,
    );
    const history = (
      await db.query(
        "select data_field_history('building_facts',$1,'value',$2,0) v",
        [newItem.id, b],
      )
    ).rows[0].v;
    assert(
      history.records.some(
        (h) => h.record_id === newItem.id && h.changes.value.after === "3",
      ),
      "shared edit appears in sibling asset history",
    );
    await login(viewer);
    assert.equal((await context(newItem.id)).can_edit, false);
    await assert.rejects(() => save(newItem.id, 3, 4), /denied/);
    // Grant the existing fund assignment, then exercise the actual generic review save.
    await db.exec("reset role");
    const asset = (
      await db.query(
        "insert into private.master_assets(name,existing_building_id) values('Physical',$1) returning id",
        [a],
      )
    ).rows[0].id;
    const fund = (
      await db.query(
        "insert into private.master_vehicles(name) values('Fund') returning id",
      )
    ).rows[0].id;
    const object = (
      await db.query(
        "insert into private.master_investment_objects(name,asset_id) values('Object',$1) returning id",
        [asset],
      )
    ).rows[0].id;
    await db.query(
      "insert into private.master_investments(vehicle_id,object_id) values($1,$2)",
      [fund, object],
    );
    await db.query(
      "insert into private.master_team_assignments(vehicle_id,source_member_id,role_kind) values($1,'40000000-0000-0000-0000-000000000002','operation_manager')",
      [fund],
    );
    await db.exec("set role authenticated");
    assert.equal((await context(newItem.id)).can_edit, true);
    await save(newItem.id, 3, 4);
    await add(b, "인터넷", "가능");
    await assert.rejects(() => add(other, "인터넷", "가능"), /denied/);
    await db.exec("reset role");
    const {
      rows: [audit],
    } = await db.query(
      "select * from private.data_record_history where record_id=$1 and origin='overview_item_add'",
      [newItem.id],
    );
    assert.deepEqual(audit.asset_ids.sort(), [a, b]);
    assert.equal(audit.changed_by, steward);
    assert.equal(audit.reason, "근거 확인");
  } finally {
    await db.close();
  }
});
