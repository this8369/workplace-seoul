import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("private operations: scoped membership, exact values, isolated history and revisions", async () => {
  const db = new PGlite();
  const ids = Array.from(
    { length: 8 },
    (_, i) => `10000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`,
  );
  const [user, other, asset, asset2, fund, staff, staff2, unit] = ids;
  const sql = async (s, p = []) => (await db.query(s, p)).rows[0]?.value;
  const as = async (id) => {
    await db.exec("reset role;set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  };
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;create schema auth;
   create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table private.workplace_members(user_id uuid,source_member_id uuid,enabled boolean,verified_until timestamptz);
   create function public.has_workplace_permission(text) returns boolean language sql stable security definer as $$select coalesce((select enabled and verified_until>now() from private.workplace_members where user_id=auth.uid()),false)$$;
   create function private.data_steward() returns boolean language sql stable as $$select false$$;
   create function private.master_no_rewrite() returns trigger language plpgsql as $$begin raise exception 'immutable';end$$;
   create table private.master_assets(id uuid primary key,existing_building_id uuid);
   create table private.master_vehicles(id uuid primary key);
   create table private.master_parties(id uuid primary key);
   create table private.master_source_rows(id uuid primary key);
   create table private.master_asset_units(id uuid primary key,asset_id uuid);
   create table private.master_investment_objects(id uuid primary key,asset_id uuid,resolution_status text);
   create table private.master_investments(vehicle_id uuid,object_id uuid,resolution_status text);
   grant usage on schema public,auth to anon,authenticated;
   insert into auth.users values('${user}'),('${other}');
   insert into private.workplace_members values('${user}','${staff}',true,now()+interval '1 day'),('${other}','${staff2}',true,now()+interval '1 day');
   insert into private.master_assets values('${asset}','${asset}'),('${asset2}','${asset2}');
   insert into private.master_vehicles values('${fund}');
   insert into private.master_asset_units values('${unit}','${asset2}');
   insert into private.master_investment_objects values('${unit}','${asset}','verified_source_evidence');
   insert into private.master_investments values('${fund}','${unit}','source_name_unique');
  `);
    await db.exec(
      await readFile(
        new URL(
          "../migrations/202610130002_private_asset_operations.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec("set role anon");
    await assert.rejects(
      () => sql(`select public.igis_operation_access('${asset}') value`),
      /permission denied/,
    );
    await as(user);
    assert.deepEqual(
      await sql(`select public.igis_operation_access('${asset}') value`),
      { scopes: [] },
    );
    await assert.rejects(
      () =>
        sql(
          `select public.igis_operation_records('igis_operating_periods','${asset}')`,
        ),
      /denied/,
    );
    await assert.rejects(
      () => sql("select * from private.igis_operating_periods"),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        sql(
          `select public.igis_operation_set_grant('${staff}','${asset}',null,'operating_actual',true,true,null,'test grant')`,
        ),
      /denied/,
    );
    await db.exec(
      `reset role;insert into private.igis_operation_grants(source_member_id,asset_id,domain,can_write,reason) values('${staff}','${asset}','operating_actual',true,'test grant'),('${staff}','${asset}','lease_contract',true,'test grant')`,
    );
    await as(user);
    const save = async (
      entity,
      key,
      revision,
      changes,
      vehicle = null,
      a = asset,
    ) =>
      sql("select public.igis_operation_save($1,$2,$3,$4,$5,$6,$7) value", [
        entity,
        a,
        vehicle,
        key,
        revision,
        changes,
        "confirmed source correction",
      ]);
    const actual = {
      source_reference: "test evidence",
      period_start: "2026-01-01",
      period_end: "2026-01-31",
      currency_code: "KRW",
      accounting_basis: "accrual",
      scope_basis: "whole_asset",
      rental_revenue: "9999999999999999.123456",
    };
    const created = await save("igis_operating_periods", null, null, actual);
    assert.equal(created.rental_revenue, actual.rental_revenue);
    assert.equal(created.revision, "1");
    await assert.rejects(
      () => save("igis_operating_periods", null, null, actual, null, asset2),
      /denied/,
    );
    await assert.rejects(
      () => save("igis_operating_plans", null, null, {}),
      /denied/,
    );
    await assert.rejects(
      () => save("leasing_quarters", null, null, {}),
      /denied/,
    );
    await assert.rejects(
      () => save("igis_operating_periods", created.id, 1, { asset_id: asset2 }),
      /immutable/,
    );
    const updated = await save("igis_operating_periods", created.id, 1, {
      note: "corrected note",
    });
    assert.equal(updated.revision, "2");
    await assert.rejects(
      () => save("igis_operating_periods", created.id, 1, { note: "stale" }),
      /revision_conflict/,
    );
    const history = () =>
      sql("select public.igis_operation_record_history($1,$2) value", [
        "igis_operating_periods",
        created.id,
      ]);
    assert.equal((await history()).length, 2);
    await as(other);
    await assert.rejects(history, /denied/);
    await assert.rejects(
      () =>
        sql(
          `select public.igis_operation_records('igis_operating_periods','${asset}')`,
        ),
      /denied/,
    );
    await as(user);
    await assert.rejects(
      () =>
        save("igis_lease_contracts", null, null, {
          source_reference: "test",
          contract_reference: "bad unit",
          started_on: "2026-01-01",
          status: "active",
          unit_id: unit,
        }),
      /unit_scope_mismatch/,
    );
    const contract = await save("igis_lease_contracts", null, null, {
      source_reference: "test",
      contract_reference: "lease-1",
      started_on: "2026-01-01",
      status: "active",
    });
    const term = {
      source_reference: "test",
      contract_id: contract.id,
      effective_from: "2026-01-01",
      effective_to: "2026-07-01",
      currency_code: "KRW",
      area_basis: "rentable",
      vat_basis: "excluded",
      monthly_rent_amount: "1000",
    };
    await save("igis_lease_terms", null, null, term);
    await assert.rejects(
      () =>
        save("igis_lease_terms", null, null, {
          ...term,
          effective_from: "2026-03-01",
        }),
      /term_overlap/,
    );
    await save("igis_lease_terms", null, null, {
      ...term,
      effective_from: "2026-07-01",
      effective_to: null,
    });
    await db.exec(
      `reset role;update private.igis_operation_grants set can_write=false where domain='operating_actual';`,
    );
    await as(user);
    await assert.rejects(
      () =>
        save("igis_operating_periods", created.id, 2, { note: "read only" }),
      /denied/,
    );
    assert.equal((await history()).length, 2);
    await db.exec(
      `reset role;update private.workplace_members set verified_until=now()-interval '1 second' where user_id='${user}'`,
    );
    await as(user);
    await assert.rejects(history, /denied/);
    // Fund grants never authorize whole-asset data or another fund's records.
    await db.exec(`reset role;update private.workplace_members set verified_until=now()+interval '1 day';update private.igis_operation_grants set can_read=false,can_write=false;
   insert into private.igis_operation_grants(source_member_id,vehicle_id,domain,can_write,reason) values('${staff}','${fund}','operating_actual',true,'fund responsibility');`);
    await as(user);
    await assert.rejects(history, /denied/);
    await save(
      "igis_operating_periods",
      null,
      null,
      { ...actual, scope_basis: "fund_share" },
      fund,
    );
    await assert.rejects(
      () =>
        save(
          "igis_cash_entries",
          null,
          null,
          {
            source_reference: "test",
            contract_id: contract.id,
            transaction_reference: "cash-1",
            occurred_on: "2026-01-01",
            currency_code: "KRW",
            direction: "in",
            category: "rent",
            amount: "1000",
          },
          fund,
        ),
      /contract_scope_mismatch/,
    );
  } finally {
    await db.close();
  }
});
