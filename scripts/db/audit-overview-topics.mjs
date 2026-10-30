import { mkdir, writeFile } from "node:fs/promises";
import { connectDatabase } from "../building-register/vworld-client.mjs";
const db = await connectDatabase();
try {
  const facts = (
    await db.query(`select f.*, b.name, b.complex_id as asset_complex_id,
    c.representative_building_id from public.building_facts f
    join public.buildings b on b.id=f.building_id
    left join public.building_complexes c on c.id=b.complex_id and c.published
    where f.field_key like '비교표 · %' or f.field_key like '% 전체 · %'
      or f.field_key in ('IFC Seoul 운영사 확인','IFC Seoul 교통 정정')
    order by b.name,f.field_key`)
  ).rows;
  await mkdir("data/private/asset-overview", { recursive: true });
  await writeFile(
    "data/private/asset-overview/overview-topics-before.json",
    JSON.stringify(facts, null, 2),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify(
      {
        records: facts.length,
        buildings: new Set(facts.map((f) => f.building_id)).size,
        labels: [
          ...new Set(facts.map((f) => f.field_key.replace(/^.*? · /, ""))),
        ].sort(),
        complexRecords: facts.filter((f) => f.asset_complex_id).length,
      },
      null,
      2,
    ),
  );
} finally {
  await db.end();
}
