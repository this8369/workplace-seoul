import { mkdir, writeFile } from "node:fs/promises";
import { connectDatabase } from "../building-register/vworld-client.mjs";

const db = await connectDatabase();
try {
  await db.query("begin transaction isolation level repeatable read read only");
  const buildings = (
    await db.query(`select b.*, c.asset_category, c.is_igis, i.status import_status,
    i.source_url import_url, i.match_reason import_match_reason, i.audit import_audit
    from public.buildings b left join public.catalog_buildings c on c.id=b.id
    left join private.officefind_floor_imports i on i.building_id=b.id
    order by b.name`)
  ).rows;
  const towers = (
    await db.query(
      "select * from public.building_towers order by complex_id,sort_order",
    )
  ).rows;
  const catalog = (
    await db.query(
      `select id,typical_floor_rentable_pyeong,typical_floor_exclusive_pyeong from public.catalog_buildings`,
    )
  ).rows;
  const grouped = (
    await db.query(`select coalesce(c.asset_category,'office') category,b.status,
    c.is_igis,count(*)::int total,count(b.typical_floor_exclusive_pyeong)::int exclusive,
    count(b.typical_floor_rentable_pyeong)::int rentable
    from public.buildings b left join public.catalog_buildings c on c.id=b.id group by 1,2,3 order by 1,2,3`)
  ).rows;
  const history = (
    await db.query(`select record_id,changed_fields,origin,reason,changed_at
    from private.data_record_history where entity='buildings'
    and origin in ('officefind_floor_import','officefind_floor_validation')
    and changed_at >= '2026-10-13T00:00:00+09:00' order by id`)
  ).rows;
  await db.query("rollback");
  const missing = buildings.filter(
    (b) => b.typical_floor_exclusive_pyeong == null,
  );
  const reasons = Object.fromEntries(
    Object.entries(
      Object.groupBy(missing, (b) => b.import_status || "never-collected"),
    ).map(([k, v]) => [k, v.length]),
  );
  const snapshot = {
    captured_at: new Date().toISOString(),
    buildings,
    towers,
    catalog,
    grouped,
    reasons,
    history,
  };
  await mkdir("data/private/officefind", { recursive: true });
  await writeFile(
    "data/private/officefind/coverage.json",
    JSON.stringify(snapshot, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        total: buildings.length,
        missing: missing.length,
        withExclusive: buildings.length - missing.length,
        towers: towers.length,
        catalog: catalog.length,
        grouped,
        reasons,
      },
      null,
      2,
    ),
  );
} finally {
  await db.end();
}
