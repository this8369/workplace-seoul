import pg from "pg";
import { readFile } from "node:fs/promises";
const { reviewerEmail, ...config } = JSON.parse(
  await readFile("data/private/db-config.json", "utf8"),
);
const db = new pg.Client({
  ...config,
  password: (await readFile("data/private/db-password", "utf8")).trim(),
  ssl: {
    rejectUnauthorized: true,
    ca: await readFile("data/private/supabase-ca.crt", "utf8"),
  },
  connectionTimeoutMillis: 15000,
});
const codes = new Map(
  JSON.parse(await readFile("data/private/legal-dong-codes.json", "utf8")).map(
    (r) => [r.code, r.name],
  ),
);
function identity(parts) {
  const [sigungu, dong, kind, bun, ji] = parts;
  if (
    !/^\d{5}$/.test(sigungu) ||
    !/^\d{5}$/.test(dong) ||
    !["0", "1"].includes(kind) ||
    !/^\d{4}$/.test(bun) ||
    !/^\d{4}$/.test(ji) ||
    !codes.has(sigungu + dong)
  )
    return null;
  return {
    pnu: sigungu + dong + (kind === "1" ? "2" : "1") + bun + ji,
    address: `${codes.get(sigungu + dong)} ${kind === "1" ? "산 " : ""}${Number(bun)}${Number(ji) ? "-" + Number(ji) : ""}`,
  };
}
try {
  await db.connect();
  await db.query("begin");
  const links = (
    await db.query(
      `select l.building_id,r.register_pk,r.parcel_key,r.source_created_date,r.collected_at from building_register_links l join building_register_records r on r.id=l.record_id where l.status='verified' and r.is_current`,
    )
  ).rows;
  const snapshots = (
    await db.query(
      `select distinct on(parcel_key) parcel_key,response from private.building_register_snapshots where operation='getBrAtchJibunInfo' order by parcel_key,collected_at desc`,
    )
  ).rows;
  let primary = 0,
    attached = 0;
  for (const link of links) {
    const parcels = [];
    const main = identity(link.parcel_key.split("-"));
    if (main) parcels.push({ ...main, primary: true });
    const snapshot = snapshots.find((s) => s.parcel_key === link.parcel_key);
    for (const page of snapshot?.response ?? []) {
      const batch = (page.response ?? page).body?.items?.item;
      for (const raw of Array.isArray(batch) ? batch : batch ? [batch] : []) {
        if (String(raw.mgmBldrgstPk) !== link.register_pk) continue;
        const row = identity(
          [
            "atchSigunguCd",
            "atchBjdongCd",
            "atchPlatGbCd",
            "atchBun",
            "atchJi",
          ].map((k, i) =>
            String(raw[k] ?? "")
              .trim()
              .padStart([5, 5, 1, 4, 4][i], "0"),
          ),
        );
        if (row && !parcels.some((p) => p.pnu === row.pnu))
          parcels.push({ ...row, primary: false });
      }
    }
    for (const p of parcels) {
      await db.query(
        `insert into building_parcels(building_id,pnu,address,is_primary,source_name,source_url,as_of,collected_at,verified) values($1,$2,$3,$4,$5,$6,$7,$8,true) on conflict(building_id,pnu) do update set is_primary=building_parcels.is_primary or excluded.is_primary`,
        [
          link.building_id,
          p.pnu,
          p.address,
          p.primary,
          `국토교통부 건축물대장 · ${p.primary ? "대표지번" : "부속지번"}`,
          "https://www.data.go.kr/data/15134735/openapi.do",
          link.source_created_date,
          link.collected_at,
        ],
      );
      p.primary ? primary++ : attached++;
    }
  }
  await db.query(process.argv.includes("--apply") ? "commit" : "rollback");
  console.log(
    JSON.stringify({
      applied: process.argv.includes("--apply"),
      primary,
      attached,
    }),
  );
} catch (e) {
  await db.query("rollback").catch(() => {});
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
