import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { prepareSubwayConnections } from "../../src/lib/asset-overview.ts";
test("asset overview: typed facts, canonical names, certification constraints, scoped edits and immutable history", async () => {
  const db = new PGlite();
  const user = "30000000-0000-0000-0000-000000000001",
    other = "30000000-0000-0000-0000-000000000002",
    b = "50000000-0000-0000-0000-000000000001";
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema private;
 create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table private.workplace_members(user_id uuid primary key,source_member_id uuid,enabled boolean,verified_until timestamptz,role text,display_name text);
 create function public.has_workplace_permission(feature text) returns boolean language sql stable security definer as $$select coalesce((select enabled and verified_until>now() from private.workplace_members where user_id=auth.uid()),false)$$;
 create table public.buildings(id uuid primary key,name text,address text,gross_area_m2 numeric,published boolean,complex_id uuid,latitude numeric,longitude numeric);
 create table public.companies(id uuid primary key);create table public.occupancies(id uuid primary key,building_id uuid,company_id uuid);create table public.building_complexes(id uuid primary key);create table public.building_towers(id uuid primary key,complex_id uuid);
 create table public.building_register_links(id uuid primary key,record_id uuid,building_id uuid,status text);
 create table public.building_register_records(id uuid primary key,building_name text,gross_area_m2 numeric);
 grant usage on schema public,auth to anon,authenticated;`);
    for (const f of [
      "202610120003_internal_master",
      "202610120004_master_related_queries",
      "202610120005_master_source_clarifications",
      "202610120006_field_review_workflow",
      "202610120007_review_member_visibility",
      "202610130004_asset_overview",
      "202610130005_overview_green_spaces",
      "202610130006_overview_register_fields",
    ])
      await db.exec(
        await readFile(
          new URL(`../migrations/${f}.sql`, import.meta.url),
          "utf8",
        ),
      );
    await db.query(`insert into auth.users values($1),($2)`, [user, other]);
    await db.query(
      `insert into private.workplace_members values($1,'809a0b49-37da-40e4-b664-8adc2eba4ad3',true,now()+interval '1 hour','admin','Steward'),($2,'40000000-0000-0000-0000-000000000002',true,now()+interval '1 hour','viewer','Other')`,
      [user, other],
    );
    await db.query(
      "insert into buildings(id,name,address,gross_area_m2,published,complex_id) values($1,'Building','Address',33057.85,true,null)",
      [b],
    );
    assert.equal(
      (await db.query("select count(*)::int n from building_asset_profiles"))
        .rows[0].n,
      1,
    );
    await db.exec("set role anon");
    await assert.rejects(
      () => db.query("select * from building_asset_profiles"),
      /permission denied/,
    );
    await db.exec("set role authenticated");
    assert.equal(
      (await db.query("select * from building_asset_profiles")).rows.length,
      0,
    );
    const login = (id) =>
      db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await login(other);
    assert.equal(
      (await db.query("select * from building_asset_profiles")).rows.length,
      1,
    );
    await assert.rejects(
      () => db.query("update building_asset_profiles set owner_name='x'"),
      /permission denied/,
    );
    const context = async (entity) =>
      (await db.query("select public.data_field_context($1,$2) v", [entity, b]))
        .rows[0].v;
    assert.equal((await context("building_asset_profiles")).can_edit, false);
    const save = (entity, field, expected, proposed) =>
      db.query("select public.data_save_field($1,$2,$3,$4,$5,$6)", [
        entity,
        b,
        field,
        JSON.stringify(expected),
        JSON.stringify(proposed),
        "사용자 확인 자료 반영",
      ]);
    await assert.rejects(
      () => save("building_asset_profiles", "views", [], ["한강뷰"]),
      /denied/,
    );
    await db.query("select public.data_submit_request($1,$2,$3,$4,$5,$6,$7)", [
      "building_asset_profiles",
      b,
      "views",
      "[]",
      '["한강뷰"]',
      "확인 요청 자료",
      "50000000-0000-0000-0000-000000000002",
    ]);
    await login(user);
    await save(
      "building_asset_profiles",
      "views",
      [],
      ["한강뷰", " 한강뷰 ", "시티뷰"],
    );
    assert.deepEqual((await context("building_asset_profiles")).record.views, [
      "한강뷰",
      "시티뷰",
    ]);
    await save("building_asset_profiles", "amenity_operators", [], ["해비치"]);
    const subwayRows = [
      { station_name: "여의도", lines: ["5호선", "9호선"], direct_connection: true },
      { station_name: "", lines: [], direct_connection: null },
    ];
    await assert.rejects(
      () => save("building_asset_profiles", "subway_connections", [], subwayRows),
      /invalid_subway_connection/,
    );
    await save("building_asset_profiles", "subway_connections", [], prepareSubwayConnections(subwayRows));
    assert.deepEqual((await context("building_asset_profiles")).record.subway_connections, subwayRows.slice(0, 1));
    await save("building_asset_profiles", "retail_operators", [], ["해 비 치"]);
    assert.deepEqual(
      (await context("building_asset_profiles")).record.retail_operators,
      ["해비치"],
    );
    assert.deepEqual(
      (
        await db.query(
          "select public.asset_name_suggestions('operator','해') v",
        )
      ).rows[0].v,
      ["해비치"],
    );
    await assert.rejects(
      () => save("building_asset_profiles", "office_area_m2", null, "-2"),
      /check constraint/,
    );
    await assert.rejects(
      () =>
        save(
          "building_asset_profiles",
          "certifications",
          [],
          [{ option_code: "leed_fake", status: "certified" }],
        ),
      /invalid_certification/,
    );
    await assert.rejects(
      () =>
        save(
          "building_asset_profiles",
          "certifications",
          [],
          [
            {
              option_code: "leed_4",
              status: "certified",
              logo_url: "javascript:alert(1)",
            },
          ],
        ),
      /invalid_certification_url/,
    );
    await save(
      "building_asset_profiles",
      "certifications",
      [],
      [
        {
          option_code: "leed_4",
          status: "certified",
          certified_on: "2026-10-13",
        },
      ],
    );
    await save("building_power_specs", "contracted_capacity_mw", null, "34");
    await save("building_power_specs", "dual_substation", null, false);
    assert.equal(
      (await context("building_power_specs")).record.contracted_capacity_mw,
      "34.000000",
    );
    await assert.rejects(
      () => save("building_power_specs", "contracted_capacity_mw", null, "35"),
      /revision_conflict/,
    );
    const h = (
      await db.query("select public.data_field_history($1,$2,$3,$4,0) v", [
        "building_asset_profiles",
        b,
        null,
        b,
      ])
    ).rows[0].v;
    assert(h.records.some((x) => x.entity === "building_power_specs"));
    assert(h.records.some((x) => x.changes.views));
    await db.exec("reset role");
    const asset = (
      await db.query(
        "insert into private.master_assets(name,existing_building_id) values('Physical',$1) returning id",
        [b],
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
    await login(other);
    assert.equal(
      (await context("building_asset_profiles")).can_edit,
      true,
      "assigned fund manager may edit own asset overview",
    );
    await save("building_asset_profiles", "ceiling_height_m", null, "2.7");
    await save("building_asset_profiles", "site_area_m2", null, "1234.5");
    await save("building_asset_profiles", "floor_area_ratio", null, "850.3");
    await save("building_asset_profiles", "efficiency_pct", null, "62.1");
    await assert.rejects(()=>save("building_asset_profiles", "efficiency_pct", "62.1000", "101"));
    await save("building_asset_profiles", "green_spaces", [], ["한강", "석촌호수"]);
    const unrelated = "50000000-0000-0000-0000-000000000003";
    await db.exec("reset role");
    await db.query(
      "insert into buildings(id,name,address,gross_area_m2,published,complex_id) values($1,'Other','Address',100,true,null)",
      [unrelated],
    );
    await db.exec("set role authenticated");
    assert.equal(
      (
        await db.query(
          "select public.data_field_context('building_asset_profiles',$1) v",
          [unrelated],
        )
      ).rows[0].v.can_edit,
      false,
    );
    await db.exec("reset role");
    await db.query(
      "update private.workplace_members set verified_until=now()-interval '1 hour' where user_id=$1",
      [other],
    );
    await db.exec("set role authenticated");
    await login(other);
    assert.equal(
      (await db.query("select * from building_asset_profiles")).rows.length,
      0,
    );
    await assert.rejects(() => context("building_asset_profiles"), /denied/);
  } finally {
    await db.close();
  }
});

test('green-space lookup limits area and radius, respects membership and follows moved coordinates', async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create table buildings(id uuid primary key,latitude numeric,longitude numeric);create function public.has_workplace_permission(text) returns boolean language sql stable as $$select current_setting('request.member',true)='yes'$$;grant select on buildings to authenticated;`);
 await db.exec(await readFile(new URL('../migrations/202610130005_overview_green_spaces.sql',import.meta.url),'utf8'));
 await db.exec(`insert into buildings values('50000000-0000-0000-0000-000000000001',37.5,127);insert into asset_green_spaces(name,area_m2,latitude,longitude,source_name,source_url,source_row,as_of) values('Near',10000,37.503,127,'Seoul','https://example.org/parks',1,'2026-09-23'),('Far',20000,37.506,127,'Seoul','https://example.org/parks',2,'2026-09-23');`);
 assert.equal((await db.query('select name from building_green_spaces')).rows[0].name,'Near');
 await db.exec('set role anon');await assert.rejects(()=>db.query('select * from building_green_spaces'),/permission denied/);
 await db.exec('set role authenticated');assert.equal((await db.query('select * from building_green_spaces')).rows.length,0);
 await db.exec("set request.member='yes'");assert.equal((await db.query('select * from building_green_spaces')).rows.length,1);
 await db.exec('reset role;update buildings set latitude=37.6');assert.equal((await db.query('select * from building_green_spaces')).rows.length,0);
 }finally{await db.close();}
});
