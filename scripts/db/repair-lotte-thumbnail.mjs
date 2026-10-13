import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { connectDatabase } from "../building-register/vworld-client.mjs";
const db = await connectDatabase(),
  apply = process.argv.includes("--apply");
const id = "fa1273b3-1673-4526-a55a-5cce4595f4d7";
try {
  await db.query("begin");
  const before = (
    await db.query(
      "select * from public.building_images where id=$1 for update",
      [id],
    )
  ).rows[0];
  assert.equal(before.review_status, "approved");
  assert(before.thumbnail_path);
  const previous = (
    await db.query(
      "select previous_record from private.image_revisions where image_id=$1 and previous_record->>'is_primary'='true' and previous_record->>'review_status'='approved' order by recorded_at desc limit 1",
      [id],
    )
  ).rows[0]?.previous_record;
  assert(previous, "Must have been an approved primary image");
  assert.equal(before.object_path, previous.object_path);
  assert.equal(before.thumbnail_path, previous.thumbnail_path);
  assert.equal(
    (
      await db.query(
        "select id from public.building_images where building_id=$1 and is_primary and id<>$2",
        [before.building_id, id],
      )
    ).rows.length,
    0,
  );
  if (apply)
    await writeFile(
      `data/private/complexes/lotte-photo-before-${Date.now()}.json`,
      JSON.stringify(before, null, 2),
    );
  await db.query(
    "update public.building_images set is_primary=true where id=$1 and not is_primary",
    [id],
  );
  const visible = (
    await db.query("select * from public.catalog_images where id=$1", [id])
  ).rows[0];
  assert(visible, "Restored public list thumbnail");
  assert.equal(visible.focal_x, before.focal_x);
  assert.equal(visible.focal_y, before.focal_y);
  assert.equal(visible.zoom_percent, before.zoom_percent);
  const building = (
    await db.query(
      "select name,complex_id,gross_area_m2 from public.catalog_buildings where id=$1",
      [before.building_id],
    )
  ).rows[0];
  assert.equal(building.name, "롯데월드타워");
  assert.equal(building.complex_id, null);
  await db.query(apply ? "commit" : "rollback");
  console.log(
    JSON.stringify({
      apply,
      name: building.name,
      standalone: true,
      thumbnailRestored: true,
      cropPreserved: true,
      focalY: visible.focal_y,
    }),
  );
} catch (e) {
  await db.query("rollback");
  throw e;
} finally {
  await db.end();
}
