// Read-only inventory for a private master-data design. Never prints row data.
import { mkdir, writeFile } from "node:fs/promises";
import { connectDatabase } from "../building-register/vworld-client.mjs";

const dir = "data/private/igis-master-20261006";
await mkdir(dir, { recursive: true, mode: 0o700 });
const db = await connectDatabase();
try {
  await db.query("begin transaction isolation level repeatable read read only");
  const columns = (
    await db.query(`select table_schema,table_name,column_name,data_type,udt_name,is_nullable,column_default,numeric_precision,numeric_scale
    from information_schema.columns where table_schema in ('public','private') order by table_schema,table_name,ordinal_position`)
  ).rows;
  const constraints = (
    await db.query(`select n.nspname as schema,t.relname as table_name,c.conname as name,c.contype as type,pg_get_constraintdef(c.oid) as definition
    from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
    where n.nspname in ('public','private') order by 1,2,3`)
  ).rows;
  const policies = (
    await db.query(
      `select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname in ('public','private')`,
    )
  ).rows;
  const specs = {
    buildings:
      "id,name,address,standard_address,road_address,parcel_address,complex_id,region,status,gross_area_m2,latitude,longitude,completion_year,published",
    companies: "id,name,industry,published",
    occupancies:
      "id,building_id,company_id,floors,area_m2,started_on,ended_on,status,as_of,published",
    building_complexes:
      "id,name,representative_building_id,gross_area_m2,area_method",
    building_towers: "id,building_id,complex_id,label,sort_order",
    tenant_movements:
      "id,company_name,from_building_id,to_building_id,from_name,to_name,link_status",
    transactions:
      "id,building_id,building_name,year,amount_won,seller,buyer,scope,link_status",
    building_parcels: "id,building_id,pnu,address",
  };
  const records = {},
    counts = {};
  for (const [table, requested] of Object.entries(specs)) {
    const actual = new Set(
      columns
        .filter((c) => c.table_schema === "public" && c.table_name === table)
        .map((c) => c.column_name),
    );
    const selected = requested.split(",").filter((c) => actual.has(c));
    records[table] = (
      await db.query(`select ${selected.join(",")} from public.${table}`)
    ).rows;
    counts[table] = records[table].length;
  }
  await db.query("rollback");
  await writeFile(
    `${dir}/existing-db.json`,
    JSON.stringify(
      {
        captured_at: new Date().toISOString(),
        read_only: true,
        columns,
        constraints,
        policies,
        counts,
        records,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      read_only: true,
      counts,
      schema_column_count: columns.length,
      output: `${dir}/existing-db.json`,
    }),
  );
} finally {
  await db.end();
}
