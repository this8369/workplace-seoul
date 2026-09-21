import pg from "pg";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { OPERATIONS, validateParcel } from "./client.mjs";
import {
  normalizeTitle,
  normalizeFloor,
  normalizeArea,
  sourcePk,
  text,
  number,
  date,
} from "./normalize.mjs";
const planPath = process.argv[2];
if (!planPath?.startsWith("data/private/") || !planPath.endsWith(".json"))
  throw new Error("Pass a private plan JSON path");
const plan = JSON.parse(await readFile(planPath, "utf8"));
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
const apply = process.argv.includes("--apply");
const counts = {
  snapshots: 0,
  records: 0,
  floors: 0,
  area_parts: 0,
  sections: 0,
  unmatched: 0,
  links: 0,
};
async function insert(table, row, conflict = "") {
  const cols = Object.keys(row);
  const values = Object.values(row).map((v) =>
    v && typeof v === "object" ? JSON.stringify(v) : v,
  );
  return (
    await db.query(
      `insert into ${table} (${cols.join(",")}) values(${cols.map((_, i) => "$" + (i + 1)).join(",")}) ${conflict} returning *`,
      values,
    )
  ).rows[0];
}
try {
  await db.connect();
  await db.query("begin");
  // Serialize imports so old snapshots cannot overwrite a later concurrent refresh.
  await db.query(
    "select pg_advisory_xact_lock(hashtext('building-register-import'))",
  );
  for (const parcel of plan.parcels) {
    const query = validateParcel(parcel),
      parcelKey = Object.values(query).join("-");
    const captures = [];
    for (const operation of plan.operations ?? OPERATIONS) {
      assert.ok(OPERATIONS.includes(operation));
      const data = JSON.parse(
        await readFile(
          `data/private/building-register/${parcelKey}-${operation}.json`,
          "utf8",
        ),
      );
      assert.deepEqual(data.query, query);
      assert.equal(data.operation, operation);
      assert.ok(Number.isFinite(Date.parse(data.collected_at)));
      const newerCapture = await db.query(
        "select 1 from private.building_register_snapshots where parcel_key=$1 and operation=$2 and collected_at>$3 limit 1",
        [parcelKey, operation, data.collected_at],
      );
      assert.equal(newerCapture.rowCount, 0, "Refuse stale endpoint capture");
      assert.equal(
        createHash("sha256").update(JSON.stringify(data.items)).digest("hex"),
        data.content_hash,
      );
      for (const row of data.items) {
        // APIs sometimes echo codes as numbers; pad before verifying parcel identity.
        for (const key of ["sigunguCd", "bjdongCd", "platGbCd", "bun", "ji"])
          assert.equal(
            String(row[key]).padStart(query[key].length, "0"),
            query[key],
            `Mismatched returned parcel ${key}`,
          );
      }
      const snap = await insert(
        "private.building_register_snapshots",
        {
          operation,
          parcel_key: parcelKey,
          query,
          content_hash: data.content_hash,
          response: data.pages,
          collected_at: data.collected_at,
        },
        "on conflict(operation,parcel_key,collected_at,content_hash) do update set content_hash=excluded.content_hash",
      );
      captures.push({ ...data, snapshot_id: snap.id });
      counts.snapshots++;
    }
    for (const data of captures.filter((c) =>
      ["getBrTitleInfo", "getBrRecapTitleInfo"].includes(c.operation),
    )) {
      const kind = data.operation === "getBrTitleInfo" ? "building" : "complex";
      const newer = await db.query(
        "select 1 from public.building_register_records where parcel_key=$1 and record_kind=$2 and collected_at>$3 limit 1",
        [parcelKey, kind, data.collected_at],
      );
      assert.equal(newer.rowCount, 0, "Refuse stale register capture");
      await db.query(
        "update public.building_register_records set is_current=false where parcel_key=$1 and record_kind=$2",
        [parcelKey, kind],
      );
      for (const raw of data.items) {
        const row = {
          ...normalizeTitle(raw, data.operation),
          parcel_key: parcelKey,
          snapshot_id: data.snapshot_id,
          collected_at: data.collected_at,
          is_current: true,
        };
        await insert(
          "public.building_register_records",
          row,
          `on conflict(register_pk,record_kind) do update set ${Object.keys(row)
            .filter((k) => !["register_pk", "record_kind"].includes(k))
            .map((k) => `${k}=excluded.${k}`)
            .join(",")}`,
        );
        counts.records++;
      }
    }
    const records = (
      await db.query(
        "select id,register_pk,record_kind from public.building_register_records where parcel_key=$1 and is_current",
        [parcelKey],
      )
    ).rows;
    for (const data of captures) {
      const isFloor = data.operation === "getBrFlrOulnInfo",
        isArea = data.operation === "getBrExposPubuseAreaInfo";
      const section =
        data.operation === "getBrJijiguInfo"
          ? "zoning"
          : data.operation === "getBrWclfInfo"
            ? "sanitation"
            : null;
      if (!isFloor && !isArea && !section) continue;
      const table = isFloor
        ? "building_register_floors"
        : isArea
          ? "building_register_area_parts"
          : "building_register_sections";
      const recordIds = records.map((r) => r.id);
      // A complete successful zero-result response clears only that endpoint's prior rows.
      if (section)
        await db.query(
          `delete from public.${table} where record_id=any($1::uuid[]) and section=$2`,
          [recordIds, section],
        );
      else
        await db.query(
          `delete from public.${table} where record_id=any($1::uuid[])`,
          [recordIds],
        );
      for (const [i, raw] of data.items.entries()) {
        const matching = records.filter((r) => r.register_pk === sourcePk(raw));
        if (matching.length !== 1) {
          counts.unmatched++;
          continue;
        }
        let fields;
        if (isFloor) fields = normalizeFloor(raw);
        else if (isArea) fields = normalizeArea(raw);
        else
          fields = {
            section,
            attributes:
              section === "zoning"
                ? {
                    category: text(raw.jijiguGbCdNm),
                    code: text(raw.jijiguCd),
                    name: text(raw.jijiguCdNm),
                    description: text(raw.etcJijigu),
                    representative: text(raw.reprYn),
                    source_created_date: date(raw.crtnDay),
                  }
                : {
                    method: text(raw.modeCdNm),
                    other_method: text(raw.etcMode),
                    capacity_people: number(raw.capaPsper),
                    capacity_m3: number(raw.capaLube),
                    unit: text(raw.unitGbCdNm),
                    source_created_date: date(raw.crtnDay),
                  },
          };
        await insert(`public.${table}`, {
          record_id: matching[0].id,
          snapshot_id: data.snapshot_id,
          source_ordinal: i + 1,
          ...fields,
        });
        counts[isFloor ? "floors" : isArea ? "area_parts" : "sections"]++;
      }
    }
  }
  for (const link of plan.links ?? []) {
    assert.ok(link.evidence?.trim());
    assert.ok(link.expected_building_name);
    const asset = (
      await db.query("select name,status from buildings where id=$1", [
        link.building_id,
      ])
    ).rows[0];
    assert.equal(asset?.name, link.expected_building_name);
    assert.equal(
      asset.status,
      "operating",
      "Development projects require separate review of existing vs proposed building",
    );
    const record = (
      await db.query(
        "select * from building_register_records where register_pk=$1 and record_kind=$2 and is_current",
        [String(link.register_pk), link.record_kind],
      )
    ).rows[0];
    assert.ok(record);
    assert.equal(record.parcel_key, link.parcel_key);
    assert.equal(record.building_name, link.expected_register_name);
    await insert(
      "public.building_register_links",
      {
        building_id: link.building_id,
        tower_id: link.tower_id ?? null,
        record_id: record.id,
        status: "verified",
        evidence: link.evidence,
        reviewed_at: new Date().toISOString(),
      },
      "on conflict(building_id,record_id) do update set tower_id=excluded.tower_id,status=excluded.status,evidence=excluded.evidence,reviewed_at=excluded.reviewed_at",
    );
    counts.links++;
  }
  await db.query(apply ? "commit" : "rollback");
  await writeFile(
    "data/private/building-register-import-audit.json",
    JSON.stringify(
      { applied: apply, at: new Date().toISOString(), counts },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(JSON.stringify({ applied: apply, ...counts }));
} catch (e) {
  await db.query("rollback").catch(() => {});
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
