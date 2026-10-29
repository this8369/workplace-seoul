// Confirm the denominator for the reviewed RSQUARE export format only.
// https://help.analytics.rsquareon.com/ko/articles/데이터-b6ed1302
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { connectDatabase } from "../building-register/vworld-client.mjs";
import {
  sourceEfficiencies,
  leaseMatchesSource,
} from "../import/market-efficiency.mjs";
const apply = process.argv.includes("--apply");
const sources = sourceEfficiencies(
  JSON.parse(await readFile("data/private/normalized.json", "utf8")),
  JSON.parse(await readFile("data/private/source-snapshot.json", "utf8")),
);
const db = await connectDatabase();
try {
  await db.query("begin");
  const before = (
    await db.query(
      "select * from public.leasing_quarters order by id for update",
    )
  ).rows;
  const ids = [],
    skipped = [];
  let corroboratedNoc = 0;
  for (const source of sources)
    for (const original of source.leases) {
      const row = before.find((r) => r.id === original.id);
      if (
        !leaseMatchesSource(row, original) ||
        Number(row.efficiency_pct) !== source.pct ||
        row.efficiency_source_period !== source.sourcePeriod ||
        row.efficiency_source_scope !== source.name
      ) {
        skipped.push({ id: original.id, reason: "source-mismatch" });
        continue;
      }
      // Corroborate the provider's definition against the export without changing
      // NOC or inferring an efficiency/interest rate to use in the calculator.
      if (
        [row.deposit, row.rent, row.fee, row.noc].every((v) => v != null) &&
        row.deposit > 0
      ) {
        const annual =
          (((Number(row.noc) * source.pct) / 100 -
            Number(row.rent) -
            Number(row.fee)) *
            12) /
          Number(row.deposit);
        assert(
          annual > 0 && annual < 0.2,
          "Source NOC contradicts the reviewed rentable-rate format",
        );
        corroboratedNoc++;
      }
      if (row.area_basis === "면적 기준 미확인") ids.push(row.id);
      else if (row.area_basis !== "임대면적 기준")
        skipped.push({ id: row.id, reason: "existing-basis-preserved" });
    }
  await db.query(
    "select set_config('app.review_origin','rsquare_rate_basis_review',true),set_config('app.review_reason','알스퀘어 제공 형식 및 공식 NOC 정의 대조: 보증금·임대료·관리비는 임대면적당, NOC는 전용면적당. 원금액 보존. https://help.analytics.rsquareon.com/ko/articles/데이터-b6ed1302',true)",
  );
  const changed = await db.query(
    "update public.leasing_quarters set area_basis='임대면적 기준' where id=any($1::uuid[]) and area_basis='면적 기준 미확인'",
    [ids],
  );
  assert.equal(changed.rowCount, ids.length);
  const after = (
    await db.query("select * from public.leasing_quarters order by id")
  ).rows;
  const values = (rows) => rows.map(({ area_basis, ...rest }) => rest);
  assert.deepEqual(values(before), values(after));
  for (const row of after)
    assert.equal(
      row.area_basis,
      ids.includes(row.id)
        ? "임대면적 기준"
        : before.find((b) => b.id === row.id).area_basis,
    );
  const report = {
    apply,
    updated: ids.length,
    corroboratedNoc,
    skipped,
    amountsAndEfficienciesPreserved: true,
  };
  await mkdir("data/private/market-efficiency", { recursive: true });
  if (apply)
    await writeFile(
      `data/private/market-efficiency/rate-basis-before-${Date.now()}.json`,
      JSON.stringify(before),
      { mode: 0o600 },
    );
  await writeFile(
    `data/private/market-efficiency/rate-basis-${apply ? "applied" : "preview"}.json`,
    JSON.stringify({ ...report, ids }, null, 2),
    { mode: 0o600 },
  );
  await db.query(apply ? "commit" : "rollback");
  console.log(JSON.stringify(report));
} catch (e) {
  await db.query("rollback");
  throw e;
} finally {
  await db.end();
}
