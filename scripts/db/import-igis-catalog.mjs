import { readFile, writeFile } from "node:fs/promises";
import { connectDatabase } from "../building-register/vworld-client.mjs";
const path = "data/private/igis-master-20261006/";
const plan = JSON.parse(await readFile(path + "catalog-plan.json", "utf8"));
const db = await connectDatabase(),
  apply = process.argv.includes("--apply");
let added = 0,
  linked = 0;
try {
  await db.query("begin");
  await db.query(
    "select pg_advisory_xact_lock(hashtext('igis-catalog-import'))",
  );
  await db.query(
    "select set_config('app.master_origin','source_ingestion',true),set_config('app.master_reason','IGIS physical assets: approved public discovery and private master linkage',true)",
  );
  for (const r of plan.rows) {
    const o = (
      await db.query(
        "select * from private.master_investment_objects where id=$1 for update",
        [r.object_id],
      )
    ).rows[0];
    if (
      !o ||
      o.source_sold_flag !== false ||
      (o.name !== r.name &&
        !r.existing &&
        r.method !== "same_source_name_and_address")
    )
      throw Error("Source changed: regenerate plan");
    if (
      o.asset_id === r.building_id &&
      o.resolution_status === "verified_source_evidence" &&
      (
        await db.query(
          "select 1 from private.igis_catalog_publications where building_id=$1",
          [r.building_id],
        )
      ).rowCount
    )
      continue;
    if (!r.existing) {
      const result = await db.query(
        `insert into public.buildings(id,name,address,standard_address,road_address,region,status,gross_area_m2,area_basis,latitude,longitude,floors_above,floors_below,parking_spaces,source_name,verified_on)
      values($1,$2,$3,$4,$5,'Others',$6,$7,$8,$9,$10,$11,$12,$13,'IGIS 원본 자산 명부',$14) on conflict(id) do nothing`,
        [
          r.building_id,
          r.name,
          r.address,
          r.standard_address,
          r.road_address,
          r.status,
          r.gross_area_m2,
          r.status === "development" ? "planned" : "actual",
          r.latitude,
          r.longitude,
          r.floors_above,
          r.floors_below,
          r.parking_spaces,
          r.source_as_of,
        ],
      );
      added += result.rowCount;
    }
    await db.query(
      `insert into private.master_assets(id,name,asset_kind,primary_use,country_code,address,latitude,longitude,gross_area_m2,lifecycle_status,existing_building_id,source_row_id,visibility)
      values($1,$2,'building',$3,$4,$5,$6,$7,$8,$9,$1,$10,'internal') on conflict(existing_building_id) where existing_building_id is not null do nothing`,
      [
        r.building_id,
        r.name,
        r.category,
        r.country_code,
        r.address,
        r.latitude,
        r.longitude,
        r.gross_area_m2,
        r.status,
        r.source_row_id,
      ],
    );
    const asset = (
      await db.query(
        "select id from private.master_assets where existing_building_id=$1",
        [r.building_id],
      )
    ).rows[0];
    if (o.asset_id && o.asset_id !== asset.id)
      throw Error("Refuse to replace a verified asset link");
    if (
      o.asset_id !== asset.id ||
      o.resolution_status !== "verified_source_evidence"
    ) {
      await db.query(
        "update private.master_investment_objects set asset_id=$2,object_kind='physical_property',resolution_status='verified_source_evidence' where id=$1",
        [r.object_id, asset.id],
      );
      linked++;
      await db.query(
        `insert into private.master_asset_links(object_id,asset_id,existing_building_id,status,evidence,source_row_id,reviewed_at) values($1,$2,$3,'verified_source_evidence',$4,$5,now())`,
        [
          r.object_id,
          asset.id,
          r.building_id,
          JSON.stringify({
            method: r.method,
            source: "IGIS 2026-10-06 original",
            public_fields_only: true,
          }),
          r.source_row_id,
        ],
      );
    }
    await db.query(
      `insert into private.igis_catalog_publications(building_id,asset_category,source_as_of,evidence) values($1,$2,$3,$4) on conflict(building_id) do nothing`,
      [
        r.building_id,
        r.category,
        r.source_as_of,
        JSON.stringify({ method: r.method, object_id: r.object_id }),
      ],
    );
  }
  const projection = await db.query(
    "select count(*)::int total,count(*) filter(where gross_area_m2*121<4000000)::int below_threshold,count(*) filter(where gross_area_m2 is null)::int unknown_area from public.catalog_buildings where is_igis",
  );
  // Public role has the projection only; all source data and details remain gated.
  await db.query("set local role anon");
  const visible = await db.query(
    "select count(*)::int total from public.catalog_buildings where is_igis",
  );
  await db.query("reset role");
  await db.query(apply ? "commit" : "rollback");
  const receipt = {
    applied: apply,
    added,
    linked,
    projection: projection.rows[0],
    anonymous_visible: visible.rows[0].total,
  };
  await writeFile(
    path + "catalog-receipt.json",
    JSON.stringify(receipt, null, 2),
    { mode: 0o600 },
  );
  console.log(JSON.stringify(receipt));
} catch (e) {
  await db.query("rollback");
  throw e;
} finally {
  await db.end();
}
