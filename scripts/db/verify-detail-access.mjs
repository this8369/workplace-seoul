import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { connectDatabase } from "../building-register/vworld-client.mjs";

const projectionOnly = process.argv.includes("--projection-only");
const env = Object.fromEntries(
  (await readFile(".env.local", "utf8"))
    .split(/\r?\n/)
    .filter((s) => /^[A-Z_]+=/.test(s))
    .map((s) => {
      const split = s.indexOf("=");
      return [
        s.slice(0, split),
        s.slice(split + 1).replace(/^['"]|['"]$/g, ""),
      ];
    }),
);
const origin = env.VITE_SUPABASE_URL;
assert.equal(new URL(origin).hostname, "hakttwxctqfxcqbwdavw.supabase.co");
const headers = { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY };
const details = [
  "buildings",
  "building_facts",
  "companies",
  "transactions",
  "transaction_assets",
  "occupancies",
  "tenant_movements",
  "leasing_quarters",
  "development_records",
  "building_images",
  "building_complexes",
  "building_towers",
  "building_register_records",
  "building_register_links",
  "building_register_floors",
  "building_register_area_parts",
  "building_register_sections",
  "building_parcels",
  "building_places",
];
const views = [
  "catalog_buildings",
  "catalog_leasing",
  "catalog_developments",
  "catalog_complexes",
  "catalog_towers",
  "catalog_images",
  "catalog_transactions",
  "catalog_boundaries",
];
async function request(path, options = {}) {
  return fetch(`${origin}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
    signal: AbortSignal.timeout(20000),
  });
}
const db = await connectDatabase();
try {
  for (const table of views) {
    const result = await request(`/rest/v1/${table}?select=*&limit=1`);
    assert.equal(result.status, 200, table);
  }
  const image = (
    await db.query(
      "select object_path,thumbnail_path from public.building_images where id in(select id from public.catalog_images) limit 1",
    )
  ).rows[0];
  assert.ok(image);
  async function sign(path) {
    return request(`/storage/v1/object/sign/building-images/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: 60 }),
    });
  }
  assert.equal(
    (await sign(image.thumbnail_path)).status,
    200,
    "Public thumbnail must remain available",
  );
  console.log("Public list/map projections and thumbnail: PASS");
  if (!projectionOnly) {
    for (const table of details) {
      const result = await request(`/rest/v1/${table}?select=*&limit=1`);
      assert.ok(
        [401, 403].includes(result.status),
        `${table}: anonymous request was not rejected (${result.status})`,
      );
    }
    const original = await sign(image.object_path);
    assert.notEqual(
      original.status,
      200,
      "Anonymous original photo signing must fail",
    );
    const download = await request(
      `/storage/v1/object/authenticated/building-images/${image.object_path}`,
    );
    assert.notEqual(
      download.status,
      200,
      "Anonymous original download must fail",
    );
    console.log(
      "Anonymous direct REST access to 19 detail tables and original photo: DENIED",
    );

    // Simulate DB roles in a rolled-back transaction; no passwords, new accounts,
    // stored privileges or live member state are changed by this verification.
    await db.query("begin");
    try {
      const member = (
        await db.query(
          "select user_id from private.workplace_members where enabled order by updated_at desc limit 1",
        )
      ).rows[0];
      assert.ok(member, "A linked member is required for policy verification");
      await db.query(
        "update private.workplace_members set role='viewer',enabled=true,permissions='{}',verified_until=now()+interval '2 minutes' where user_id=$1",
        [member.user_id],
      );
      const assume = async (id) => {
        await db.query("set local role authenticated");
        await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
          id,
        ]);
      };
      await assume("00000000-0000-0000-0000-000000000001");
      for (const table of details)
        assert.equal(
          (await db.query(`select count(*)::int n from public.${table}`))
            .rows[0].n,
          0,
          `Unregistered: ${table}`,
        );
      await assume(member.user_id);
      assert.ok(
        (await db.query("select count(*)::int n from public.buildings")).rows[0]
          .n > 0,
      );
      assert.ok(
        (
          await db.query(
            "select count(*)::int n from public.building_register_records",
          )
        ).rows[0].n > 0,
      );
      assert.ok(
        (
          await db.query(
            "select count(*)::int n from storage.objects where bucket_id='building-images' and name=$1",
            [image.object_path],
          )
        ).rows[0].n > 0,
      );
      for (const condition of [
        "enabled=false",
        "verified_until=now()-interval '1 second'",
        "permissions='{\"details.read\":false}'::jsonb",
      ]) {
        await db.query("reset role");
        await db.query(
          "update private.workplace_members set enabled=true,verified_until=now()+interval '2 minutes',permissions='{}' where user_id=$1",
          [member.user_id],
        );
        await db.query(
          `update private.workplace_members set ${condition} where user_id=$1`,
          [member.user_id],
        );
        await assume(member.user_id);
        for (const table of details)
          assert.equal(
            (await db.query(`select count(*)::int n from public.${table}`))
              .rows[0].n,
            0,
            `${condition}: ${table}`,
          );
        assert.equal(
          (
            await db.query(
              "select count(*)::int n from storage.objects where bucket_id='building-images' and name=$1",
              [image.object_path],
            )
          ).rows[0].n,
          0,
        );
      }
      console.log(
        "Production RLS: active viewer ALLOWED; unregistered/disabled/expired/denied DENIED",
      );
    } finally {
      await db.query("rollback");
    }
    const unsafe = await db.query(
      "select table_name,privilege_type from information_schema.role_table_grants where grantee='anon' and table_schema='public' and table_name=any($1)",
      [details],
    );
    assert.equal(
      unsafe.rowCount,
      0,
      "Detail tables must have no anonymous grants",
    );
    console.log("Anonymous table privileges removed: PASS");
  }
} finally {
  await db.end();
}
