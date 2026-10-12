import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { connectDatabase } from "../building-register/vworld-client.mjs";
import { PGlite } from "@electric-sql/pglite";
const dir = "data/private/igis-master-20261006";
const input = JSON.parse(await readFile(`${dir}/initial-import.json`, "utf8"));
const live = process.argv.includes("--apply");
const db = live ? await connectDatabase() : new PGlite();
const tables = [
  "master_assets",
  "master_parties",
  "master_vehicles",
  "master_investment_objects",
  "master_organizations",
  "master_investments",
  "master_loan_contracts",
  "master_loan_positions",
  "master_beneficiary_positions",
  "master_aum_snapshots",
  "master_identifiers",
  "master_aliases",
  "master_asset_components",
  "master_asset_units",
  "master_occupancies",
  "master_party_relationships",
  "master_party_roles",
  "master_company_financials",
  "master_business_locations",
  "master_vehicle_relationships",
  "master_team_assignments",
  "master_asset_links",
  "master_review_issues",
];
async function exec(sql) {
  return live ? db.query(sql) : db.exec(sql);
}
async function insert(table, records) {
  if (!records.length) return;
  const columns = Object.keys(
    records.reduce((all, r) => ({ ...all, ...r }), {}),
  );
  if (columns.some((c) => !/^\w+$/.test(c))) throw Error("invalid column");
  for (let i = 0; i < records.length; i += 100) {
    const chunk = records.slice(i, i + 100);
    await db.query(
      `insert into private.${table} (${columns.join(",")}) select ${columns.join(",")} from jsonb_populate_recordset(null::private.${table},$1::jsonb)`,
      [JSON.stringify(chunk)],
    );
  }
}
try {
  if (!live) {
    await exec(`create role anon;create role authenticated;create schema private;create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql as $$select null::uuid$$;
   create table private.workplace_members(user_id uuid primary key,enabled boolean,verified_until timestamptz,role text);
   create function public.has_workplace_permission(text) returns boolean language sql as $$select false$$;
   create table public.buildings(id uuid primary key);create table public.companies(id uuid primary key);create table public.occupancies(id uuid primary key);create table public.building_complexes(id uuid primary key);create table public.building_towers(id uuid primary key);`);
    await exec(
      await readFile(
        "supabase/migrations/202610120003_internal_master.sql",
        "utf8",
      ),
    );
    const e = JSON.parse(await readFile(`${dir}/existing-db.json`, "utf8"));
    for (const t of [
      "buildings",
      "companies",
      "occupancies",
      "building_complexes",
      "building_towers",
    ])
      for (const r of e.records[t])
        await db.query(`insert into public.${t}(id) values($1)`, [r.id]);
  }
  await exec("begin");
  await db.query("select pg_advisory_xact_lock(610120003)");
  const receipt = await db.query(
    "select id,status from private.master_import_batches where content_hash=$1",
    [input.batch.content_hash],
  );
  if (receipt.rows.length) {
    if (receipt.rows[0].status !== "complete")
      throw Error("incomplete existing import");
    await exec("rollback");
    console.log("Already imported: no rows or MY changes overwritten.");
  } else {
    const existing = await db.query(
      "select id from private.master_import_batches limit 1",
    );
    if (existing.rows.length)
      throw Error(
        "Later source files require a three-way comparison; initial importer will not overwrite the canonical master.",
      );
    await insert("master_import_batches", [input.batch]);
    await db.query(
      "select set_config('app.master_origin','initial_import',true),set_config('app.master_reason','Initial authorized Aurum import',true),set_config('app.master_batch',$1,true)",
      [input.batch.id],
    );
    for (const file of input.files) {
      const bytes = await readFile(file.local_path);
      if (createHash("sha256").update(bytes).digest("hex") !== file.sha256)
        throw Error("Source hash mismatch");
      await db.query(
        "insert into private.master_import_files(id,batch_id,name,sha256,original_xlsx,metadata) values($1,$2,$3,$4,$5,$6)",
        [
          file.id,
          file.batch_id,
          file.name,
          file.sha256,
          bytes,
          JSON.stringify(file.metadata),
        ],
      );
    }
    await insert("master_source_rows", input.rows);
    await insert(
      "master_field_dictionary",
      input.dictionary.map((f) => ({
        source_system: "aurum",
        source_file_type: f.source_file.replace(/_\d+[.]xlsx$/, ""),
        source_column: f.column,
        source_label: f.source_label,
        target_table: f.target_table,
        target_field: f.target_field,
        postgres_type: f.postgres_type,
        rules: f.notes,
      })),
    );
    for (const table of tables) await insert(table, input.tables[table]);
    const counts = {};
    for (const t of tables) {
      const n = Number(
        (await db.query(`select count(*) n from private.${t}`)).rows[0].n,
      );
      if (n !== input.tables[t].length) throw Error(`Count mismatch: ${t}`);
      counts[t] = n;
    }
    const n = Number(
      (await db.query("select count(*) n from private.master_source_rows"))
        .rows[0].n,
    );
    if (n !== 5630) throw Error("Source row count mismatch");
    const totals = (
      await db.query(`select 'lenders' dataset,sum(commitment_amount)::text committed,sum(drawn_amount)::text funded from private.master_loan_positions
    union all select 'beneficiaries',sum(commitment_amount)::text,sum(funded_amount)::text from private.master_beneficiary_positions
    union all select 'aum',sum(committed_aum)::text,sum(funded_aum)::text from private.master_aum_snapshots`)
    ).rows;
    const audit = JSON.parse(await readFile(`${dir}/audit.json`, "utf8"));
    const checks = [
      ["lenders", "대주 정보 조회", "대출약정금액(원)", "대출인출금액(원)"],
      ["beneficiaries", "수익자 정보 조회", "총약정금액", "투입금액"],
      [
        "aum",
        "펀드 AUM 관리",
        "약정 금액 기준 / AUM(원)",
        "투입 금액 기준 / AUM(원)",
      ],
    ];
    for (const [label, source, c, f] of checks) {
      const row = totals.find((r) => r.dataset === label);
      for (const [column, field] of [
        ["committed", c],
        ["funded", f],
      ]) {
        const expected = audit.controls[source].find(
          (x) => x.field === field,
        ).sum;
        const ok = (
          await db.query("select $1::numeric=$2::numeric ok", [
            row[column],
            expected,
          ])
        ).rows[0].ok;
        if (!ok) throw Error(`Control total mismatch: ${label}/${column}`);
      }
    }
    await db.query(
      "update private.master_import_batches set status='complete' where id=$1",
      [input.batch.id],
    );
    const report = {
      live,
      completed_at: new Date().toISOString(),
      batch_id: input.batch.id,
      counts,
      source_rows: n,
      control_totals_match: true,
      totals,
    };
    await exec("commit");
    await writeFile(
      `${dir}/${live ? "production" : "local"}-receipt.json`,
      JSON.stringify(report, null, 2),
      { mode: 0o600 },
    );
    console.log(
      JSON.stringify({
        live,
        counts,
        source_rows: n,
        control_totals_match: true,
      }),
    );
  }
} catch (e) {
  await exec("rollback").catch(() => {});
  throw e;
} finally {
  await (live ? db.end() : db.close());
}
