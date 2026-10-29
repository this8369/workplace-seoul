import { mkdir, readFile, writeFile } from "node:fs/promises";
import { connectDatabase } from "../building-register/vworld-client.mjs";
const db = await connectDatabase();
try {
  await db.query("set statement_timeout='20s'");
  if (process.argv.includes("--preview")) {
    await db.query("begin");
    const sql = await readFile(
      "supabase/migrations/202610290002_detail_lookup_performance.sql",
      "utf8",
    );
    await db.query(sql.replace(/^begin;\s*/, "").replace(/commit;\s*$/, ""));
  }
  const cases = (
    await db.query(
      "select id,name from buildings where id in ('3d45429d-b4ae-5d6d-a191-6bdfe44590a8','7df6d5d3-eb4c-511e-ae38-604106fd47e8','ba032999-4901-52ab-bd54-4fed8b90660a') order by name",
    )
  ).rows;
  const results = [];
  const first = cases.find(
    (b) => b.id === "7df6d5d3-eb4c-511e-ae38-604106fd47e8",
  );
  const c = (
    await db.query("select complex_id from buildings where id=$1", [first.id])
  ).rows[0].complex_id;
  cases.push({ id: c, name: "IFC complex", complex: true });
  for (const b of cases) {
    for (const [view, column] of b.complex
      ? [
          ["detail_buildings", "complex_id"],
          ["detail_building_complexes", "id"],
        ]
      : [
          ["detail_buildings", "id"],
          ["detail_building_asset_profiles", "id"],
          ["detail_building_register_overview", "id"],
          ["detail_building_images", "building_id"],
          ["detail_leasing_quarters", "building_id"],
        ]) {
      const started = performance.now();
      const plan = (
        await db.query(
          `explain(analyze,buffers,format json) select * from ${view} where ${column}=$1`,
          [b.id],
        )
      ).rows[0]["QUERY PLAN"][0];
      const nodes = [];
      const walk = (n) => {
        if (n["Actual Total Time"] > 5)
          nodes.push({
            node: n["Node Type"],
            relation: n["Relation Name"],
            rows: n["Actual Rows"],
            loops: n["Actual Loops"],
            ms: n["Actual Total Time"],
            filter: n.Filter,
          });
        for (const c of n.Plans || []) walk(c);
      };
      walk(plan.Plan);
      const result = {
        asset: b.name,
        view,
        roundtripMs: Math.round(performance.now() - started),
        planningMs: plan["Planning Time"],
        executionMs: plan["Execution Time"],
        jit: plan.JIT,
        nodes,
      };
      results.push({ ...result, plan });
      console.log(JSON.stringify(result));
    }
  }
  await mkdir("data/private/performance", { recursive: true });
  await writeFile(
    `data/private/performance/detail-loading-${process.argv.includes("--preview") ? "preview" : "current"}.json`,
    JSON.stringify(results, null, 2),
  );
} finally {
  await db.query("rollback").catch(() => {});
  await db.end();
}
