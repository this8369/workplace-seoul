import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("land and nearby records require both verification and a published asset; visitors cannot write", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table buildings(id uuid primary key, published boolean);
      grant select on buildings to anon,authenticated;
      insert into buildings values('00000000-0000-0000-0000-000000000001',true),('00000000-0000-0000-0000-000000000002',false);`);
    await db.exec(
      await readFile(
        new URL(
          "../migrations/202609280001_asset_context.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(`insert into building_parcels(building_id,pnu,address,source_name,verified) values
      ('00000000-0000-0000-0000-000000000001','1111012200100700000','A','test',true),
      ('00000000-0000-0000-0000-000000000001','1111012200100710000','B','test',false),
      ('00000000-0000-0000-0000-000000000002','1111012200100720000','C','test',true);
      insert into building_places(building_id,category,name,source_name,verified) values
      ('00000000-0000-0000-0000-000000000001','transit','Station','test',true),
      ('00000000-0000-0000-0000-000000000002','transit','Hidden','test',true);`);
    await assert.rejects(
      () => db.exec(`update building_places set walking_minutes=3`),
      /check constraint/,
    );
    await assert.rejects(
      () =>
        db.exec(
          `update building_parcels set geometry='{"type":"Point","coordinates":[127,37]}'`,
        ),
      /check constraint/,
    );
    await db.exec("set role anon");
    assert.equal(
      (await db.query("select * from building_parcels")).rows.length,
      1,
    );
    assert.equal(
      (await db.query("select * from building_places")).rows.length,
      1,
    );
    await assert.rejects(
      () => db.exec("update building_parcels set verified=true"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
