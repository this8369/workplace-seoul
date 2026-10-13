import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { connectDatabase } from "../building-register/vworld-client.mjs";
const apply = process.argv.includes("--apply");
const db = await connectDatabase();
const source = JSON.parse(
  await readFile(
    "data/private/asset-overview/comparison-20261013.json",
    "utf8",
  ),
);
const empty = (v) => v == null || v === "" || (Array.isArray(v) && !v.length);
const shared = [
  "owner_name",
  "site_area_m2",
  "floor_area_ratio",
  "efficiency_pct",
  "retail_area_m2",
  "retail_area_basis",
  "contractor_name",
  "architect_name",
  "views",
  "green_spaces",
  "hotels",
  "amenity_operators",
  "retail_operators",
  "subway_connections",
  "certifications",
];
const changes = [];
const conflicts = [];
const m2 = (v) =>
  v == null ? undefined : Number(((v * 400) / 121).toFixed(4));
async function fill(table, row, patch, reason) {
  assert(
    ["buildings", "building_asset_profiles", "building_complexes"].includes(
      table,
    ),
  );
  for (const [field, value] of Object.entries(patch)) {
    if (empty(value)) continue;
    const previous = row[field];
    if (
      JSON.stringify(previous) === JSON.stringify(value) ||
      (previous != null &&
        !Array.isArray(value) &&
        Number.isFinite(Number(value)) &&
        Number(previous) === Number(value))
    )
      continue;
    if (
      !empty(previous) &&
      !(field.endsWith("_basis") && previous === "unknown")
    ) {
      if (
        JSON.stringify(previous) !== JSON.stringify(value) &&
        !(typeof value === "number" && Number(previous) === value)
      )
        conflicts.push({ id: row.id, field, previous, proposed: value });
      continue;
    }
    assert(/^[a-z_]+[a-z_0-9]*$/.test(field));
    await db.query("select set_config('app.review_reason',$1,true)", [reason]);
    await db.query(`update public.${table} set ${field}=$2 where id=$1`, [
      row.id,
      Array.isArray(value) ? JSON.stringify(value) : value,
    ]);
    changes.push({ table, id: row.id, field, previous, value, reason });
    row[field] = value;
  }
}
try {
  await db.query("begin");
  await db.query(
    "select set_config('app.review_origin','complex_overview_consolidation',true)",
  );
  const complexes = (
    await db.query(
      "select * from public.building_complexes where published order by id",
    )
  ).rows;
  for (const c of complexes) {
    const members = (
      await db.query(
        "select * from public.buildings where complex_id=$1 order by id",
        [c.id],
      )
    ).rows;
    const profiles = (
      await db.query(
        "select p.* from public.building_asset_profiles p join public.buildings b on b.id=p.id where b.complex_id=$1 order by p.id",
        [c.id],
      )
    ).rows;
    const canonical = profiles.find(
      (p) => p.id === c.representative_building_id,
    );
    assert(canonical);
    const parent = members.find((b) => b.id === c.representative_building_id);
    assert(parent);
    const r = source.rows.find((r) =>
      r.ids.some((id) => members.some((b) => b.id === id)),
    );
    if (r) {
      await fill(
        "building_asset_profiles",
        canonical,
        {
          site_area_m2: m2(r.site),
          retail_area_m2: m2(r.retail),
          retail_area_basis: r.retail ? "exclusive" : undefined,
          architect_name: r.architect,
          contractor_name: r.contractor,
          views: r.views,
          green_spaces: r.nature,
          hotels: r.hotels,
          amenity_operators: r.operators,
          retail_operators: r.retailOperators,
          subway_connections: r.stations
            ?.filter((s) => s[2] != null)
            .map(([station_name, lines, direct_connection]) => ({
              station_name,
              lines,
              direct_connection,
            })),
          certifications: [
            ...(r.leed
              ? [
                  {
                    option_code: r.leed,
                    status: r.planned ? "planned" : "certified",
                  },
                ]
              : []),
            ...(r.well
              ? [
                  {
                    option_code: "well_unspecified",
                    status: r.planned ? "planned" : "certified",
                  },
                ]
              : []),
          ],
        },
        "사용자 제공 비교표: 공통 시설·운영 정보를 단지 공통 자산개요로 통합",
      );
      await fill(
        "building_complexes",
        c,
        {
          parking_spaces: r.parking,
          contracted_capacity_mw: r.mw,
          dual_substation: r.dual,
        },
        "단지 공통 자산개요: 기존 전체 범위 근거값 연결",
      );
      for (const p of profiles)
        await fill(
          "building_asset_profiles",
          p,
          { ceiling_height_m: r.ceiling, lease_span_m: r.span },
          "비교표의 단일 사양을 동별 초기값으로 보존; 이후 동별 독립 수정",
        );
      const scale = /^B(\d+)\s*\/\s*(\d+)F?$/.exec(r.scale || "");
      if (scale)
        for (const b of members)
          await fill(
            "buildings",
            b,
            { floors_below: Number(scale[1]), floors_above: Number(scale[2]) },
            "비교표에 단일값으로 확인된 규모를 동별 초기값으로 보존",
          );
    }
    for (const p of profiles) {
      if (p.id === canonical.id) continue;
      await fill(
        "building_asset_profiles",
        canonical,
        Object.fromEntries(shared.map((k) => [k, p[k]])),
        "기존 동별 원본의 누락 공통값을 단지 대표 자산개요에 연결",
      );
    }
    if (parent.complex_scope === "aggregate") {
      const w = (
        await db.query(
          "select * from public.building_power_specs where id=$1",
          [parent.id],
        )
      ).rows[0];
      await fill(
        "building_complexes",
        c,
        {
          parking_spaces: parent.parking_spaces,
          contracted_capacity_mw: w?.contracted_capacity_mw,
          dual_substation: w?.dual_substation,
        },
        "기존 단지 전체 주차·전력 값 보존",
      );
      // Heights and spans are specifications, not additive areas. Existing child values win.
      for (const p of profiles)
        if (p.id !== canonical.id)
          await fill(
            "building_asset_profiles",
            p,
            {
              ceiling_height_m: canonical.ceiling_height_m,
              lease_span_m: canonical.lease_span_m,
            },
            "기존 공통 사양의 동별 초기값 보존; 독립 수정 전환",
          );
    }
  }
  // Preserve original evidence and every prior value; no source records are deleted.
  await writeFile(
    `data/private/complexes/overview-consolidation-${apply ? "applied" : "preview"}.json`,
    JSON.stringify({ changes, conflicts }, null, 2),
  );
  await db.query(apply ? "commit" : "rollback");
  console.log(
    JSON.stringify({
      mode: apply ? "applied" : "preview",
      complexes: complexes.length,
      fields: changes.length,
      existingValuesPreserved: conflicts.length,
      changesByTable: Object.fromEntries(
        ["buildings", "building_asset_profiles", "building_complexes"].map(
          (t) => [t, changes.filter((c) => c.table === t).length],
        ),
      ),
    }),
  );
} catch (e) {
  await db.query("rollback");
  throw e;
} finally {
  await db.end();
}
