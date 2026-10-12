import { readFile, writeFile, mkdir } from "node:fs/promises";
import { connectDatabase } from "../building-register/vworld-client.mjs";
const db = await connectDatabase();
try {
  const rows = (
    await db.query(
      `select b.*,c.is_igis,c.asset_category,coalesce((select jsonb_agg(i) from building_images i where i.building_id=b.id and i.is_primary and i.review_status='approved'),'[]') images from buildings b join catalog_buildings c on c.id=b.id order by b.name`,
    )
  ).rows;
  const missing = rows.filter((r) => r.is_igis && !r.images.length);
  await mkdir("data/private/images/igis", { recursive: true });
  const suffix = process.argv.includes("--after") ? "-after" : "";
  await writeFile(
    `data/private/images/igis/inventory${suffix}.json`,
    JSON.stringify(rows, null, 2),
  );
  await writeFile(
    `data/private/images/igis/missing${suffix}.json`,
    JSON.stringify(missing, null, 2),
  );
  if (suffix) {
    const before = JSON.parse(
      await readFile("data/private/images/igis/missing.json", "utf8"),
    );
    const approved = JSON.parse(
      await readFile("data/private/images/igis/approved.json", "utf8"),
    );
    const published = (
      await db.query(
        "select building_id from catalog_images where building_id=any($1::uuid[])",
        [approved],
      )
    ).rows;
    const now = new Map(rows.map((r) => [r.id, r]));
    const added = before
      .filter((r) => now.get(r.id)?.images.length)
      .map((r) => ({
        id: r.id,
        name: r.name,
        images: now
          .get(r.id)
          .images.map((i) => ({
            id: i.id,
            kind: i.kind,
            source_url: i.source_url,
            source_image_url: i.source_image_url,
            thumbnail_path: i.thumbnail_path,
          })),
      }));
    const report = {
      checked_at: new Date().toISOString(),
      before_missing: before.length,
      added: added.length,
      remaining: missing.length,
      approved_manifest: approved.length,
      published_manifest_assets: new Set(published.map((r) => r.building_id))
        .size,
      added_assets: added,
      remaining_assets: missing.map((r) => ({
        id: r.id,
        name: r.name,
        address: r.road_address || r.address,
        category: r.asset_category,
        reason: "확실히 일치하는 외관 사진/조감도 미확보 또는 원본 접근 불가",
      })),
    };
    await writeFile(
      "data/private/images/igis/result.json",
      JSON.stringify(report, null, 2),
    );
    console.log(
      JSON.stringify({
        added: report.added,
        published: report.published_manifest_assets,
        remaining: report.remaining,
      }),
    );
  }
  console.log(
    JSON.stringify({
      igis: rows.filter((r) => r.is_igis).length,
      missing: missing.length,
      domestic: missing.filter(
        (r) => /[가-힣]/.test(r.address) && !r.address.includes("아래 자산"),
      ).length,
      byCategory: Object.fromEntries(
        [...new Set(missing.map((r) => r.asset_category))].map((k) => [
          k,
          missing.filter((r) => r.asset_category === k).length,
        ]),
      ),
    }),
  );
  if (!suffix)
    console.log(
      missing
        .filter((r) => r.asset_category === "office")
        .map((r) => `${r.name}\t${r.road_address || r.address}`)
        .join("\n"),
    );
} finally {
  await db.end();
}
