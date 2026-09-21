import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { fetchRegister } from "../../scripts/building-register/client.mjs";
import {
  normalizeTitle,
  date,
  number,
  sourcePk,
} from "../../scripts/building-register/normalize.mjs";
const parcel = {
  sigunguCd: "11140",
  bjdongCd: "11800",
  platGbCd: "0",
  bun: "0831",
  ji: "0000",
};
test("API handles pagination and zero counts without leaking credentials", async () => {
  let calls = 0;
  const data = await fetchRegister("getBrTitleInfo", parcel, {
    serviceKey: "test-secret",
    delayMs: 0,
    fetchImpl: async (url) => {
      calls++;
      assert.equal(url.searchParams.get("pageNo"), String(calls));
      return new Response(
        JSON.stringify({
          response: {
            header: { resultCode: "00" },
            body: { items: { item: { mgmBldrgstPk: calls } }, totalCount: 2 },
          },
        }),
      );
    },
  });
  assert.equal(data.items.length, 2);
  assert.ok(!JSON.stringify(data).includes("test-secret"));
  const empty = await fetchRegister("getBrTitleInfo", parcel, {
    serviceKey: "test-secret",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          response: {
            header: { resultCode: "00" },
            body: { items: "", totalCount: 0 },
          },
        }),
      ),
  });
  assert.deepEqual(empty.items, []);
  await assert.rejects(
    () =>
      fetchRegister("getBrTitleInfo", parcel, {
        serviceKey: "test-secret",
        fetchImpl: async () => {
          throw new Error("https://example.com?serviceKey=test-secret");
        },
      }),
    (e) => !e.message.includes("test-secret") && e.message.includes("network"),
  );
  await assert.rejects(
    () =>
      fetchRegister("getBrTitleInfo", parcel, {
        serviceKey: "test-secret",
        fetchImpl: async () =>
          new Response("<returnReasonCode>30</returnReasonCode>test-secret"),
      }),
    /code 30/,
  );
});
test("registry dates, unknown values and scope are preserved", () => {
  assert.equal(date("20200230"), null);
  assert.equal(date("00000000"), null);
  assert.equal(date("2020"), null);
  assert.equal(date("20200708"), "2020-07-08");
  assert.equal(number(" "), null);
  assert.equal(number(0), 0);
  const row = normalizeTitle(
    { mgmBldrgstPk: 123, totArea: 100, useAprDay: "20200708" },
    "getBrRecapTitleInfo",
  );
  assert.equal(row.record_kind, "complex");
  assert.equal(row.gross_area_m2, 100);
  assert.equal(row.site_area_m2, null);
  assert.equal(row.approval_date, "2020-07-08");
  assert.ok(!("typical_floor_exclusive_pyeong" in row));
  assert.throws(() => sourcePk({ mgmBldrgstPk: 9007199254740992 }), /Unsafe/);
});
test("registry privacy follows verified links and asset visibility; multiple use rows per floor survive", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;`,
    );
    for (const name of [
      "202609180001_core.sql",
      "202609180002_sheet_ingestion.sql",
      "202609180003_asset_archive.sql",
      "202609180004_review_workspace.sql",
      "202609210005_physical_towers.sql",
      "202609210007_building_register.sql",
    ])
      await db.exec(
        await readFile(
          new URL("../migrations/" + name, import.meta.url),
          "utf8",
        ),
      );
    const asset = (
      await db.query(
        "insert into buildings(name,address,region,status,gross_area_m2,area_basis,source_name) values('Asset','Address','CBD','operating',40000,'actual','test') returning id",
      )
    ).rows[0];
    const snap = (
      await db.query(
        "insert into private.building_register_snapshots(operation,parcel_key,query,content_hash,response,collected_at) values('getBrTitleInfo','11140-11800-0-0831-0000','{}',repeat('a',64),'{}',now()) returning id",
      )
    ).rows[0];
    const record = (
      await db.query(
        "insert into building_register_records(register_pk,record_kind,parcel_key,snapshot_id,collected_at) values('123','building','11140-11800-0-0831-0000',$1,now()) returning id",
        [snap.id],
      )
    ).rows[0];
    await db.query(
      "insert into building_register_links(building_id,record_id,evidence) values($1,$2,'identity review')",
      [asset.id, record.id],
    );
    for (let i = 1; i <= 2; i++)
      await db.query(
        "insert into building_register_floors(record_id,snapshot_id,source_ordinal,register_pk,floor_number,area_m2) values($1,$2,$3,'123',1,150)",
        [record.id, snap.id, i],
      );
    await db.exec("set role anon");
    assert.equal(
      (await db.query("select * from building_register_records")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from building_register_floors")).rows.length,
      0,
    );
    await assert.rejects(
      () => db.query("select * from private.building_register_snapshots"),
      /permission denied/,
    );
    await db.exec("reset role");
    await db.exec(
      "update building_register_links set status='verified',reviewed_at=now()",
    );
    await db.exec("set role anon");
    assert.equal(
      (await db.query("select * from building_register_records")).rows.length,
      0,
    );
    await db.exec("reset role");
    await db.exec(
      "update buildings set published=true,verified_on=current_date",
    );
    await db.exec("set role anon");
    assert.equal(
      (await db.query("select * from building_register_records")).rows.length,
      1,
    );
    assert.equal(
      (await db.query("select * from building_register_floors")).rows.length,
      2,
    );
    await assert.rejects(
      () =>
        db.exec("update building_register_records set building_name='wrong'"),
      /permission denied/,
    );
    await db.exec("reset role");
    await db.exec("update building_register_links set status='rejected'");
    await db.exec("set role anon");
    assert.equal(
      (await db.query("select * from building_register_floors")).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
