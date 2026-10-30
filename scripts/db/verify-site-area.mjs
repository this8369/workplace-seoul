import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { connectDatabase } from "../building-register/vworld-client.mjs";

const preview = process.argv.includes("--preview");
const db = await connectDatabase();
try {
  await db.query("begin; set local statement_timeout='30s'");
  const buildings = (
    await db.query(`select b.id,b.name,b.status,c.representative_building_id,p.site_area_m2
    from buildings b left join building_complexes c on c.id=b.complex_id and c.published
    join building_asset_profiles p on p.id=b.id where public.is_public_detail_asset(b.id)`)
  ).rows;
  const before = (
    await db.query(
      "select id,site_area_m2 from detail_building_register_overview",
    )
  ).rows;
  if (preview) {
    const sql = await readFile(
      "supabase/migrations/202610300001_register_site_area.sql",
      "utf8",
    );
    await db.query(sql.replace(/^begin;\s*/, "").replace(/commit;\s*$/, ""));
  }
  const after = (
    await db.query(
      "select id,site_area_m2 from detail_building_register_overview",
    )
  ).rows;
  const manual = (
    await db.query("select id,site_area_m2 from building_asset_profiles")
  ).rows;
  for (const b of buildings)
    assert.equal(
      manual.find((p) => p.id === b.id)?.site_area_m2,
      b.site_area_m2,
      "manual profile values preserved",
    );
  for (const row of before.filter((r) => Number(r.site_area_m2) > 0))
    assert.equal(
      after.find((r) => r.id === row.id)?.site_area_m2,
      row.site_area_m2,
      "existing register facts preserved",
    );
  const display = (facts, b) => {
    const source = buildings.find(
      (x) => x.id === (b.representative_building_id || b.id),
    );
    return (
      source?.site_area_m2 ??
      facts.find((f) => f.id === source?.id)?.site_area_m2 ??
      null
    );
  };
  const added = buildings
    .filter((b) => !Number(display(before, b)) && Number(display(after, b)) > 0)
    .map((b) => ({ id: b.id, name: b.name, site_area_m2: display(after, b) }));
  const samples = buildings.filter((b) =>
    /파크원|H'Square|롯데월드타워|마제스타/.test(b.name),
  );
  const timings = [];
  for (const b of samples) {
    const plan = (
      await db.query(
        "explain(analyze,format json) select site_area_m2 from detail_building_asset_profiles where id=$1",
        [b.id],
      )
    ).rows[0]["QUERY PLAN"][0];
    timings.push({ name: b.name, ms: plan["Execution Time"] });
  }
  const sourceCounts = (
    await db.query(`select count(*) filter(where parent_register_pk is not null)::int parent_links,
    count(*) filter(where site_parcel_pnus is not null)::int complete_parcel_sets from building_register_records where is_current`)
  ).rows[0];
  await db.query("set local role anon");
  const anonSample = (
    await db.query(
      "select site_area_m2 from detail_building_asset_profiles where id=$1",
      [samples[0].id],
    )
  ).rows[0];
  assert(Number(anonSample.site_area_m2) > 0);
  await db.query("reset role");
  const report = {
    preview,
    assets: buildings.length,
    visible: buildings.filter((b) => Number(display(after, b)) > 0).length,
    operatingMissing: buildings.filter(
      (b) => b.status === "operating" && !Number(display(after, b)),
    ).length,
    added,
    ...sourceCounts,
    anonymousRead: true,
    manualValuesPreserved: true,
    timings,
  };
  await db.query("rollback");
  await mkdir("data/private/asset-overview", { recursive: true });
  await writeFile(
    `data/private/asset-overview/site-area-${preview ? "preview" : "applied"}.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        ...report,
        added: added.map((b) => ({
          name: b.name,
          site_area_m2: b.site_area_m2,
        })),
      },
      null,
      2,
    ),
  );
} finally {
  await db.query("rollback").catch(() => {});
  await db.end();
}
