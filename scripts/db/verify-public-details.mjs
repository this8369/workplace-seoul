import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { connectDatabase } from "../building-register/vworld-client.mjs";

const preview = process.argv.includes("--preview");
const db = await connectDatabase();
try {
  await db.query("begin");
  if (preview) {
    const sql = await readFile(
      "supabase/migrations/202610140001_public_asset_details.sql",
      "utf8",
    );
    await db.query(sql.replace(/^begin;\s*/, "").replace(/commit;\s*$/, ""));
  }
  const views = (
    await db.query(
      "select table_name from information_schema.views where table_schema='public' and table_name like 'detail_%' order by table_name",
    )
  ).rows.map((r) => r.table_name);
  assert.equal(views.length, 23);
  const columns = (
    await db.query(
      "select column_name from information_schema.columns where table_schema='public' and table_name like 'detail_%'",
    )
  ).rows.map((r) => r.column_name);
  for (const secret of [
    "snapshot_id",
    "source_row_id",
    "evidence",
    "review_note",
    "rights_note",
    "reviewed_by",
    "updated_by",
    "content_hash",
  ])
    assert(!columns.includes(secret), secret);
  const counts = {};
  for (const role of ["anon", "authenticated"]) {
    await db.query(`set local role ${role}`);
    for (const view of views) {
      try {
        counts[view] = Number(
          (await db.query(`select count(*) n from public.${view}`)).rows[0].n,
        );
      } catch (e) {
        e.message = `${role}/${view}: ${e.message}`;
        throw e;
      }
      assert.equal(
        (
          await db.query(
            "select has_table_privilege(current_user,$1,'INSERT,UPDATE,DELETE') allowed",
            [`public.${view}`],
          )
        ).rows[0].allowed,
        false,
      );
    }
    assert(counts.detail_buildings > 0);
    const excluded = (
      await db.query(
        "select count(*) n from public.catalog_buildings b where not exists(select 1 from public.detail_buildings d where d.id=b.id)",
      )
    ).rows[0].n;
    assert.equal(
      Number(excluded),
      0,
      "Every public discovery asset has general detail",
    );
    assert.equal(
      (
        await db.query(
          "select count(*) n from public.detail_building_images where review_status<>'approved'",
        )
      ).rows[0].n,
      "0",
    );
    assert.equal(
      (
        await db.query(
          "select count(*) n from public.detail_leasing_quarters where data_domain<>'market_leasing'",
        )
      ).rows[0].n,
      "0",
    );
    if (role === "anon") {
      for (const table of [
        "buildings",
        "building_images",
        "leasing_quarters",
        "building_asset_profiles",
        "building_register_records",
      ]) {
        assert.equal(
          (
            await db.query(
              "select has_table_privilege('anon',$1,'SELECT') allowed",
              [`public.${table}`],
            )
          ).rows[0].allowed,
          false,
          table,
        );
      }
      for (const fn of [
        "master_asset_context(uuid)",
        "igis_operation_access(uuid)",
        "data_field_context(text,uuid)",
      ]) {
        assert.equal(
          (
            await db.query(
              "select has_function_privilege('anon',$1,'EXECUTE') allowed",
              [`public.${fn}`],
            )
          ).rows[0].allowed,
          false,
          fn,
        );
      }
    }
    await db.query("reset role");
  }
  const unexpected = (
    await db.query(`select count(*) n from public.detail_buildings b where b.is_igis and not exists(
  select 1 from private.igis_catalog_publications i where i.building_id=b.id or exists(
   select 1 from private.complex_component_assets m join public.buildings parent on parent.id=m.parent_building_id
   where m.building_id=b.id and m.parent_building_id=i.building_id and parent.complex_scope='aggregate'))`)
  ).rows[0].n;
  assert.equal(
    Number(unexpected),
    0,
    "No IGIS association inherited from siblings",
  );
  const privatePaths = (
    await db.query(
      "select count(*) n from public.building_images i where i.review_status<>'approved' and i.object_path is not null and public.is_public_detail_image(i.object_path) and not exists(select 1 from public.detail_building_images a where a.object_path=i.object_path or a.thumbnail_path=i.object_path)",
    )
  ).rows[0].n;
  assert.equal(Number(privatePaths), 0);
  const hiddenAssets = (
    await db.query(
      "select count(*) n from public.buildings b where not public.is_public_detail_asset(b.id) and exists(select 1 from public.detail_buildings d where d.id=b.id)",
    )
  ).rows[0].n;
  assert.equal(Number(hiddenAssets), 0);
  const classification = (
    await db.query(
      "select c.name,t.label,b.is_igis from public.detail_building_towers t join public.detail_building_complexes c on c.id=t.complex_id join public.detail_buildings b on b.id=t.building_id where c.name in ('센터필드','IFC Seoul','이오타 서울','트윈트리타워') order by c.name,t.sort_order",
    )
  ).rows;
  if (process.argv.includes("--fixture")) {
    const fixtures = {};
    for (const view of views) {
      // Opt-in local UI fixtures contain only this public projection.
      fixtures[view.slice(7)] = (
        await db.query(
          `select coalesce(json_agg(r),'[]'::json) data from public.${view} r`,
        )
      ).rows[0].data;
    }
    await writeFile(
      "/tmp/workplace-public-detail-fixture.json",
      JSON.stringify(fixtures),
    );
  }
  await db.query("rollback");
  console.log(
    JSON.stringify({
      preview,
      views: views.length,
      assets: counts.detail_buildings,
      approvedPhotos: counts.detail_building_images,
      rawTablesPrivate: true,
      igisPrivate: true,
      viewsReadOnly: true,
      perBuildingIgis: classification,
    }),
  );
} catch (e) {
  await db.query("rollback");
  throw e;
} finally {
  await db.end();
}
