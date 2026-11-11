import { readdir } from "node:fs/promises";

export async function pgliteMigrations() {
  return (await readdir(new URL("../migrations/", import.meta.url)))
    // pgAudit requires the managed Postgres extension. The live verifier checks it.
    .filter((file) => file.endsWith(".sql") && file !== "202611110002_audit_fund_reads.sql")
    .sort();
}
