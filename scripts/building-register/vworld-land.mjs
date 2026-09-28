import { connectDatabase, vworldClient } from "./vworld-client.mjs";
const request = await vworldClient(),
  db = await connectDatabase(),
  apply = process.argv.includes("--apply");
const ops = [
  "getLandCharacteristics",
  "getIndvdLandPriceAttr",
  "getLandUseAttr",
  "getPossessionAttr",
];
const source = "VWorld 국가중점데이터";
const number = (v) =>
  v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? "") ? v : null);
async function records(pnu, op) {
  const all = [];
  for (let page = 1; ; page++) {
    const json = await request(
      "/ned/data/" + op,
      { pnu, format: "json", numOfRows: "1000", pageNo: String(page) },
      `${pnu}-${op}-${page}`,
    );
    const root = Object.values(json).find(
      (v) => v && typeof v === "object" && "totalCount" in v,
    );
    if (!root || (root.resultCode && !["00", "0"].includes(root.resultCode)))
      throw new Error(`Invalid ${op} response`);
    const rows = Array.isArray(root.field)
      ? root.field
      : root.field
        ? [root.field]
        : [];
    if (rows.some((r) => String(r.pnu) !== pnu))
      throw new Error("Parcel identity mismatch");
    all.push(...rows);
    if (all.length >= Number(root.totalCount)) return all;
    if (!rows.length || page >= 100)
      throw new Error("Incomplete VWorld pagination");
  }
}
let done = 0,
  attributes = 0,
  prices = 0,
  zoning = 0,
  ownership = 0;
try {
  const parcels = (
    await db.query(
      "select distinct pnu from building_parcels where verified order by pnu",
    )
  ).rows;
  let index = 0;
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (index < parcels.length) {
        const { pnu } = parcels[index++];
        const batches = [];
        for (const op of ops) batches.push(await records(pnu, op));
        const [chars, priceRows, zones, owners] = batches;
        chars.sort((a, b) =>
          String(b.stdrYear + b.stdrMt + b.lastUpdtDt).localeCompare(
            String(a.stdrYear + a.stdrMt + a.lastUpdtDt),
          ),
        );
        const c = chars[0];
        const yearly = new Map();
        for (const p of priceRows.sort((a, b) =>
          String(a.stdrYear + a.stdrMt + a.pblntfDe).localeCompare(
            String(b.stdrYear + b.stdrMt + b.pblntfDe),
          ),
        )) {
          if (number(p.pblntfPclnd) > 0 && number(p.stdrYear) >= 1900)
            yearly.set(Number(p.stdrYear), {
              year: Number(p.stdrYear),
              price_won_m2: Number(p.pblntfPclnd),
              as_of: date(p.pblntfDe),
              source_name: source,
              source_url:
                "https://www.vworld.kr/dtna/dtna_apiSvcFc_s001.do?apiNum=25",
            });
        }
        const zoneList = [
          ...new Map(
            zones
              .filter((z) => z.prposAreaDstrcCodeNm)
              .map((z) => [
                z.prposAreaDstrcCode + "-" + z.cnflcAt,
                {
                  name: z.prposAreaDstrcCodeNm,
                  relation: z.cnflcAtNm ?? "",
                  as_of: date(z.lastUpdtDt),
                  source_name: source,
                },
              ]),
          ).values(),
        ];
        const latestYm = owners
            .map((o) => o.stdrYm ?? "")
            .sort()
            .at(-1),
          currentOwners = owners.filter((o) => o.stdrYm === latestYm);
        const types =
          [
            ...new Set(
              currentOwners.map((o) => o.posesnSeCodeNm).filter(Boolean),
            ),
          ].join(" · ") || null;
        const owner = currentOwners.length === 1 ? currentOwners[0] : null;
        if (apply)
          await db.query(
            `update building_parcels set area_m2=coalesce($2,area_m2),land_category=coalesce($3,land_category),land_use=coalesce($4,land_use),terrain=coalesce($5,terrain),shape=coalesce($6,shape),road_condition=coalesce($7,road_condition),ownership_type=$8,ownership_changed_on=$9,coowners=$10,zoning=$11,official_prices=$12,as_of=coalesce($13,as_of),source_name='국토교통부 건축물대장 · VWorld 연속지적도·국가중점데이터',source_url='https://www.vworld.kr/dtna/dtna_apiSvcList_s001.do',collected_at=now() where pnu=$1 and verified`,
            [
              pnu,
              c ? number(c.lndpclAr) : null,
              c?.lndcgrCodeNm,
              c?.ladUseSittnNm,
              c?.tpgrphHgCodeNm,
              c?.tpgrphFrmCodeNm,
              c?.roadSideCodeNm,
              types,
              date(owner?.ownshipChgDe),
              owner ? number(owner.cnrsPsnCo) : null,
              JSON.stringify(zoneList),
              JSON.stringify([...yearly.values()]),
              c
                ? date(`${c.stdrYear}-${String(c.stdrMt).padStart(2, "0")}-01`)
                : null,
            ],
          );
        attributes += !!c;
        prices += yearly.size > 0;
        zoning += zoneList.length > 0;
        ownership += !!types;
        done++;
        if (done % 25 === 0)
          console.log(JSON.stringify({ done, total: parcels.length }));
      }
    }),
  );
  console.log(
    JSON.stringify({
      apply,
      parcels: done,
      attributes,
      prices,
      zoning,
      ownership,
    }),
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
