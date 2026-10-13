import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { connectDatabase } from "../building-register/vworld-client.mjs";
const db = await connectDatabase(),
  apply = process.argv.includes("--apply");
try {
  await db.query("begin");
  const before = {
    buildings: (await db.query("select * from public.buildings order by id"))
      .rows,
    images: (await db.query("select * from public.building_images order by id"))
      .rows,
  };
  const towers = (
    await db.query(
      "select t.*,c.name complex_name,c.representative_building_id from public.building_towers t join public.building_complexes c on c.id=t.complex_id where c.published and t.published and t.building_id is null and t.parent_tower_id is null and t.component_kind<>'facility' order by c.name,t.sort_order for update of t",
    )
  ).rows;
  if (apply)
    await writeFile(
      `data/private/complexes/component-assets-before-${Date.now()}.json`,
      JSON.stringify(before, null, 2),
    );
  await db.query(
    "select set_config('app.review_origin','component_asset_connection',true),set_config('app.review_reason','동별 전체 상세·사진 관리 연결, 단지 합계 및 기존 자산 보존',true)",
  );
  let photos = 0;
  for (const t of towers) {
    const parent = before.buildings.find(
      (b) => b.id === t.representative_building_id,
    );
    assert(parent);
    const child = (
      await db.query(
        `insert into public.buildings(name,address,standard_address,road_address,region,status,gross_area_m2,area_basis,latitude,longitude,overview,floors_above,floors_below,parking_spaces,source_name,source_url,complex_id,complex_scope,published)
   values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'component',false) returning id`,
        [
          `${t.complex_name} ${t.label}`,
          parent.address,
          parent.standard_address,
          parent.road_address,
          parent.region,
          parent.status,
          t.gross_area_m2,
          parent.area_basis,
          parent.latitude,
          parent.longitude,
          t.overview,
          t.floors_above,
          t.floors_below,
          t.parking_spaces,
          "동별 등록 정보 · 주소와 위치는 단지 기준",
          t.evidence?.source_url || t.source_url || parent.source_url,
          t.complex_id,
        ],
      )
    ).rows[0].id;
    await db.query(
      "insert into private.complex_component_assets(tower_id,building_id,parent_building_id) values($1,$2,$3)",
      [t.id, child, parent.id],
    );
    await db.query(
      "update public.building_towers set building_id=$1 where id=$2",
      [child, t.id],
    );
    await db.query(
      "update public.building_power_specs set contracted_capacity_mw=$1 where id=$2",
      [t.contracted_capacity_mw, child],
    );
    // Copy metadata once, with independent IDs/crop/order/primary flags. No recurring synchronization.
    for (const image of before.images.filter(
      (i) =>
        i.building_id === parent.id &&
        i.review_status === "approved" &&
        i.kind !== "floor_plan",
    )) {
      const { id, created_at, updated_at, ...copy } = image;
      copy.building_id = child;
      copy.inherited_from_image_id = id;
      const cols = Object.keys(copy);
      await db.query(
        `insert into public.building_images(${cols.map((c) => '"' + c + '"').join(",")}) values(${cols.map((_, i) => "$" + (i + 1)).join(",")})`,
        Object.values(copy),
      );
      photos++;
    }
  }
  const originals = (
    await db.query(
      "select * from public.buildings where id=any($1::uuid[]) order by id",
      [before.buildings.map((b) => b.id)],
    )
  ).rows;
  assert.deepEqual(originals, before.buildings);
  const images = (
    await db.query(
      "select * from public.building_images where id=any($1::uuid[]) order by id",
      [before.images.map((i) => i.id)],
    )
  ).rows;
  assert.deepEqual(images, before.images);
  await db.query(apply ? "commit" : "rollback");
  console.log(
    JSON.stringify({
      apply,
      complexes: new Set(towers.map((t) => t.complex_id)).size,
      connectedComponents: towers.length,
      independentPhotoRecords: photos,
      originalAssetsAndPhotosUnchanged: true,
    }),
  );
} catch (e) {
  await db.query("rollback");
  throw e;
} finally {
  await db.end();
}
