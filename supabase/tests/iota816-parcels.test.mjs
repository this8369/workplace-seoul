import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("IOTA 816 includes Metro parcels while retaining the inactive building and source data", async () => {
  const db = new PGlite();
  const iota = "540fb099-e033-55d2-890b-e9dae2e08dae";
  const metro = "c63f4003-2d88-5945-a677-c8ef1ab099ae";
  const migration = (name) => readFile(new URL(`../migrations/${name}.sql`, import.meta.url), "utf8");
  try {
    await db.exec("create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$select null::uuid$$;");
    await db.exec(await migration("202609180001_core"));
    await db.exec(await migration("202609280001_asset_context"));
    await db.query(`insert into buildings(id,name,address,region,status,gross_area_m2,area_basis,source_name,verified_on) values
      ($1,'이오타 816 (양동 8-1,6지구)','526','CBD','development',100000,'planned','test',current_date),
      ($2,'메트로타워','537','CBD','operating',40000,'actual','test',current_date)`, [iota, metro]);
    for (const [pnu, area, building] of [
      ["1114011800105260000",3081.1,iota],
      ["1114011800105300000",93.9,metro],
      ["1114011800105310000",233.7,metro],
      ["1114011800105370000",3778.5,metro],
    ]) {
      await db.query(`insert into building_parcels(building_id,pnu,address,area_m2,is_primary,geometry,official_prices,source_name,verified)
        values($1,$2,'test',$3,$4,'{"type":"Polygon","coordinates":[]}', '[{"year":2026,"price_won_m2":100}]','VWorld',true)`,
      [building,pnu,area,building===iota]);
    }
    await db.exec(await migration("202609290001_iota816_metro_parcels"));
    const {rows: parcels} = await db.query("select * from building_parcels where building_id=$1",[iota]);
    assert.equal(parcels.length,4);
    assert.equal(parcels.filter(p=>p.is_primary).length,1);
    assert.equal(parcels.reduce((sum,p)=>sum+Number(p.area_m2),0),7187.2);
    const {rows: old} = await db.query("select * from buildings where id=$1",[metro]);
    assert.equal(old[0].status,"inactive");
    assert.equal(old[0].redevelopment_building_id,iota);
    const {rows: original} = await db.query("select * from building_parcels where building_id=$1",[metro]);
    assert.equal(original.length,3);
    for (const p of original) {
      const copy=parcels.find(row=>row.pnu===p.pnu);
      assert.deepEqual(copy.geometry,p.geometry);
      assert.deepEqual(copy.official_prices,p.official_prices);
      assert.equal(copy.source_name,p.source_name);
    }
    const {rows: visible} = await db.query("select id from buildings where status in ('operating','development')");
    assert.deepEqual(visible.map(r=>r.id),[iota]);
  } finally { await db.close(); }
});
