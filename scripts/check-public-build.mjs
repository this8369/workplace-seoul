import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";

const textExtensions = new Set([".html", ".js", ".css", ".svg"]);
const assetExtensions = new Set([
  ".png",
  ".ico",
  ".webp",
  ".jpg",
  ".woff2",
  ".ttf",
]);
const internalRpc =
  /\b(?:master_(?:asset_context|list_records|query_records|record_history|save_record)|igis_operation_(?:access|records|save|record_history|set_grant))\b/;
const privilegedKey =
  /\bsb_secret_[\w-]+|-----BEGIN [A-Z ]*PRIVATE KEY-----|postgres(?:ql)?:\/\/[^\s"'`]+@/;

function jwtRole(token) {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString())
      .role;
  } catch {
    return undefined;
  }
}

const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (
  publishableKey &&
  !/^sb_publishable_[\w-]+$/.test(publishableKey) &&
  jwtRole(publishableKey) !== "anon"
) {
  throw new Error("Public build requires a Supabase publishable or anon key.");
}

async function check(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (
      entry.name.startsWith(".") ||
      entry.name === "private" ||
      entry.isSymbolicLink()
    ) {
      throw new Error(`Unexpected path in public build: ${path}`);
    }
    if (entry.isDirectory()) {
      await check(path);
      continue;
    }
    const extension = extname(path);
    if (assetExtensions.has(extension)) continue;
    if (!textExtensions.has(extension))
      throw new Error(`Unexpected public file: ${path}`);
    const content = await readFile(path, "utf8");
    if (
      privilegedKey.test(content) ||
      [...content.matchAll(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g)].some(([token]) =>
        ["service_role", "supabase_admin"].includes(jwtRole(token)),
      )
    ) {
      throw new Error(`Privileged credential in public file: ${path}`);
    }
    if (internalRpc.test(content))
      throw new Error(`Internal fund endpoint in public file: ${path}`);
  }
}

await check("dist");
console.log("Public build security check passed.");
