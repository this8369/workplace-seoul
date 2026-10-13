import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { connectDatabase } from "../building-register/vworld-client.mjs";
const source = JSON.parse(
  await readFile(
    "data/private/asset-overview/comparison-20261013.json",
    "utf8",
  ),
);
const imageHash = createHash("sha256")
  .update(await readFile("data/private/asset-overview/comparison-20261013.png"))
  .digest("hex");
const apply = process.argv.includes("--apply"),
  db = await connectDatabase();
const report = {
    mode: apply ? "apply" : "preview",
    source: source.sourceName,
    imageHash,
    projects: source.rows.length,
    assets: 0,
    fields: 0,
    facts: 0,
    conflicts: [],
    unchanged: 0,
  },
  backup = [];
const m2 = (p) =>
  p == null ? undefined : Number(((p * 400) / 121).toFixed(4));
const same = (a, b) =>
  typeof b === "number"
    ? a != null && Math.abs(Number(a) - b) < 0.0001
    : JSON.stringify(a) === JSON.stringify(b);
const empty = (x) => x == null || x === "" || (Array.isArray(x) && !x.length);
const uuid = (s) => {
  const h = createHash("sha256").update(s).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
async function fill(table, record, patch, project) {
  assert(
    ["buildings", "building_asset_profiles", "building_power_specs"].includes(
      table,
    ),
  );
  const accepted = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value == null) continue;
    assert(/^[a-z_][a-z0-9_]*$/.test(key));
    const old = record[key];
    if (Array.isArray(value)) {
      const merged = [...(old || [])];
      for (const v of value) {
        const identity =
          typeof v === "object" ? v.option_code || v.station_name : v;
        if (
          !merged.some(
            (x) =>
              (typeof x === "object" ? x.option_code || x.station_name : x) ===
              identity,
          )
        )
          merged.push(v);
      }
      if (!same(old, merged)) accepted[key] = merged;
      else report.unchanged++;
    } else if (empty(old) || (key.endsWith("_area_basis") && old === "unknown"))
      accepted[key] = value;
    else if (!same(old, value))
      report.conflicts.push({
        project,
        asset: record.id,
        table,
        field: key,
        existing: old,
        provided: value,
      });
    else report.unchanged++;
  }
  const entries = Object.entries(accepted);
  if (!entries.length) return;
  await db.query(
    `update public.${table} set ${entries.map(([k], i) => `${k}=$${i + 2}`).join(",")} where id=$1`,
    [
      record.id,
      ...entries.map(([, v]) => (Array.isArray(v) ? JSON.stringify(v) : v)),
    ],
  );
  report.fields += entries.length;
}
async function fact(
  id,
  category,
  key,
  value,
  unit = null,
  url = null,
  name = source.sourceName,
) {
  if (value == null || value === "" || ["-", "TBD", "모름"].includes(value))
    return;
  const rid = uuid(`comparison-20261013:${id}:${key}`),
    old = (
      await db.query("select value from public.building_facts where id=$1", [
        rid,
      ])
    ).rows[0];
  if (old) {
    assert(same(old.value, value), `Previously imported fact changed: ${key}`);
    report.unchanged++;
    return;
  }
  await db.query(
    "insert into public.building_facts(id,building_id,category,field_key,value,unit,as_of,source_name,source_url,published) values($1,$2,$3,$4,$5::jsonb,$6,null,$7,$8,true)",
    [rid, id, category, key, JSON.stringify(value), unit, name, url],
  );
  report.facts++;
}
try {
  await db.query("begin");
  await db.query(
    "select set_config('app.review_origin','user_reference_import',true),set_config('app.review_reason',$1,true)",
    [`사용자 요청 비교표 입력 · 자료 기준일 미표기 · SHA256 ${imageHash}`],
  );
  for (const r of source.rows)
    for (const id of r.ids) {
      const b = (
        await db.query(
          "select * from public.buildings where id=$1 for update",
          [id],
        )
      ).rows[0];
      assert(b);
      assert.equal(b.status, r.planned ? "development" : "operating");
      const p = (
          await db.query(
            "select * from public.building_asset_profiles where id=$1 for update",
            [id],
          )
        ).rows[0],
        w = (
          await db.query(
            "select * from public.building_power_specs where id=$1 for update",
            [id],
          )
        ).rows[0];
      assert(p && w);
      backup.push({ project: r.name, building: b, profile: p, power: w });
      report.assets++;
      const cert = [
        { option_code: r.leed, status: r.planned ? "planned" : "certified" },
        ...(r.well
          ? [
              {
                option_code: "well_unspecified",
                status: r.planned ? "planned" : "certified",
              },
            ]
          : []),
      ];
      const common = {
        ceiling_height_m: r.ceiling,
        lease_span_m: r.span,
        architect_name: r.architect,
        contractor_name: r.contractor,
        views: r.views,
        green_spaces: r.nature,
        hotels: r.hotels,
        amenity_operators: r.operators,
        retail_operators: r.retailOperators,
        certifications: cert,
        subway_connections: r.stations
          .filter((x) => x[2] !== null)
          .map(([station_name, lines, direct_connection]) => ({
            station_name,
            lines,
            direct_connection,
          })),
      };
      if (!r.group) {
        await fill(
          "building_asset_profiles",
          p,
          {
            ...common,
            office_area_m2: m2(r.office),
            retail_area_m2: m2(r.retail),
            retail_area_basis: r.retail ? "exclusive" : undefined,
            site_area_m2: m2(r.site),
          },
          r.name,
        );
        await fill(
          "building_power_specs",
          w,
          { contracted_capacity_mw: r.mw, dual_substation: r.dual },
          r.name,
        );
        const scale = /^B(\d+)\s*\/\s*(\d+)F$/.exec(r.scale);
        await fill(
          "buildings",
          b,
          {
            parking_spaces: r.parking,
            completion_year: r.planned ? undefined : r.year,
            floors_below: scale ? Number(scale[1]) : undefined,
            floors_above: scale ? Number(scale[2]) : undefined,
          },
          r.name,
        );
      }
      const prefix = r.group ? `${r.name} 전체 · ` : "비교표 · ";
      if (r.group)
        await fact(
          id,
          "specification",
          prefix + "적용 범위",
          "프로젝트 전체 참고값 · 개별 동/부지에 배분하지 않음",
        );
      const observations = [
        ["연면적", r.gross, "평"],
        ["오피스면적", r.office, "평"],
        ["리테일 전용면적", r.retail, "평"],
        ["대지면적", r.site, "평"],
        ["공개공지 면적", r.open, "평"],
        ["공개공지/대지면적", r.openRatio, "%"],
        ["규모", r.scale],
        ["기준층 전용면적", r.floor, "평"],
        ["주차대수", r.parking, "대"],
        ["주차대수 당 GFA", r.parkingGfa, "평/대"],
        ["천정고", r.ceiling, "m"],
        ["Lease Span", r.span, "m"],
        ["설계사", r.architect],
        ["시공사", r.contractor],
        ["자산계약수전량", r.mw, "MW"],
        ["이중변전소", r.dual == null ? null : r.dual ? "O" : "X"],
        [r.planned ? "준공 예정" : "준공연도", r.year, "년"],
      ];
      for (const [k, v, u] of observations) {
        // Single-asset mapped fields are already in their normal cards. Preserve only
        // rounded/conflicting source observations and fields without an existing slot.
        if (
          !r.group &&
          [
            "오피스면적",
            "리테일 전용면적",
            "대지면적",
            "천정고",
            "Lease Span",
            "설계사",
            "시공사",
            "자산계약수전량",
            "이중변전소",
            "주차대수",
            "규모",
            "준공연도",
          ].includes(k)
        )
          continue;
        if (
          !r.group &&
          k === "연면적" &&
          Math.abs((Number(b.gross_area_m2) * 121) / 400 - r.gross) < 0.6
        )
          continue;
        if (
          !r.group &&
          k === "기준층 전용면적" &&
          /^\d+$/.test(v || "") &&
          Math.abs(Number(b.typical_floor_exclusive_pyeong) - Number(v)) < 0.6
        )
          continue;
        await fact(
          id,
          k === "준공 예정" ? "development" : "specification",
          prefix + k,
          v,
          u,
        );
      }
      if (r.group)
        for (const [key, value] of [
          ["VIEW", r.views?.join(" · ")],
          ["자연환경", r.nature?.join(" · ")],
          ["호텔", r.hotels?.join(" · ")],
          ["어메니티 운영사", r.operators?.join(" · ")],
          ["브랜드 리테일 운영사", r.retailOperators?.join(" · ")],
          [
            "친환경 인증",
            cert
              .map(
                (c) =>
                  `${c.option_code.replace("leed_4", "LEED Platinum").replace("leed_3", "LEED Gold").replace("leed_2", "LEED Silver").replace("well_unspecified", "WELL (등급 미기재)")}${r.planned ? " (계획)" : ""}`,
              )
              .join(" · "),
          ],
        ])
          await fact(id, "amenity", prefix + key, value);
      await fact(
        id,
        "access",
        prefix + "교통",
        r.stations.map(([n, l]) => `${l.join("·")} ${n}`).join(" / "),
      );
      if (r.group)
        await fact(
          id,
          "access",
          prefix + "지하철 직연결",
          r.stations
            .filter((x) => x[2] !== null)
            .map(([n, l, d]) => `${l.join("·")} ${n} ${d ? "O" : "X"}`)
            .join(" / "),
        );
      await fact(id, "amenity", prefix + "자연환경 규모", r.natureArea);
      for (const [key, value] of Object.entries(r.amenities || {}))
        await fact(id, "amenity", prefix + key, value);
      for (const [key, value] of Object.entries(r.retailCounts || {}))
        await fact(id, "amenity", `${prefix}리테일 · ${key}`, value, "개");
      for (const [key, value] of Object.entries(r.wellness || {}))
        await fact(
          id,
          "amenity",
          `${prefix}웰니스 · ${key}`,
          value,
          typeof value === "number" ? "개" : null,
        );
      await fact(id, "amenity", prefix + "비고", r.note);
      if (r.name === "IFC Seoul") {
        await fact(
          id,
          "access",
          "IFC Seoul 교통 정정",
          "표의 5·6호선은 공식 안내의 5·9호선으로 정정",
          null,
          "https://www.ifcseoul.com/ko/BD_01_00.asp",
          "IFC Seoul 공식 안내",
        );
        await fact(
          id,
          "amenity",
          "IFC Seoul 운영사 확인",
          "SIFC Property Korea YH",
          null,
          "https://www.ifcseoul.com/privacy/ifc_seoul_privacy_policy_20260417.html",
          "IFC Seoul 공식 운영 안내",
        );
      }
    }
  const n = (
    await db.query(
      "select count(*)::int n from private.data_record_history where origin='user_reference_import' and reason like $1",
      [`%${imageHash}%`],
    )
  ).rows[0].n;
  report.audit_records = n;
  await writeFile(
    `data/private/asset-overview/comparison-${apply ? "apply" : "preview"}-report.json`,
    JSON.stringify(report, null, 2),
  );
  if (apply) {
    await writeFile(
      `data/private/asset-overview/comparison-before-${Date.now()}.json`,
      JSON.stringify(backup, null, 2),
    );
    await db.query("commit");
  } else await db.query("rollback");
  console.log(JSON.stringify(report, null, 2));
} catch (e) {
  await db.query("rollback");
  throw e;
} finally {
  await db.end();
}
