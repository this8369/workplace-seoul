import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { connectDatabase } from "../building-register/vworld-client.mjs";
const db = await connectDatabase(),
  preview = process.argv.includes("--preview");
try {
  await db.query("begin");
  const before = (
    await db.query("select * from public.building_images order by id")
  ).rows;
  if (process.argv.includes("--snapshot")) {
    await mkdir("data/private/images", { recursive: true });
    await writeFile(
      `data/private/images/order-before-${Date.now()}.json`,
      JSON.stringify(before),
      { mode: 0o600 },
    );
  }
  if (preview) {
    const sql = await readFile(
      "supabase/migrations/202610140002_image_order_primary.sql",
      "utf8",
    );
    await db.query(sql.replace(/^begin;\s*/, "").replace(/commit;\s*$/, ""));
  }
  const after = (
    await db.query("select * from public.building_images order by id")
  ).rows;
  const stable = (rows) =>
    rows.map(({ is_primary, updated_at, ...image }) => image);
  assert.deepEqual(
    stable(after),
    stable(before),
    "Files, crop, sequence, review and tower identity are unchanged",
  );
  const invalid = (
    await db.query(`select count(*) n from public.building_images primary_photo where primary_photo.is_primary and exists(
  select 1 from public.building_images earlier where earlier.building_id=primary_photo.building_id
  and earlier.review_status='approved' and earlier.kind<>'floor_plan' and earlier.object_path is not null
  and earlier.sort_order<primary_photo.sort_order)`)
  ).rows[0].n;
  assert.equal(Number(invalid), 0);
  const changed = after.filter(
    (image, i) => image.is_primary !== before[i].is_primary,
  );
  const east = (
    await db.query(
      "select i.id,i.sort_order,i.is_primary from public.building_images i join public.buildings b on b.id=i.building_id where b.name='센터필드 East' and i.review_status='approved' order by i.sort_order",
    )
  ).rows;
  assert.equal(east[0].sort_order, 1);
  assert.equal(east[0].is_primary, true);
  assert.equal(east[1].is_primary, false);
  await db.query("rollback");
  console.log(
    JSON.stringify({
      preview,
      changedPhotos: changed.length,
      changedAssets: new Set(changed.map((i) => i.building_id)).size,
      east,
      filesAndCropsUnchanged: true,
    }),
  );
} catch (e) {
  await db.query("rollback");
  throw e;
} finally {
  await db.end();
}
