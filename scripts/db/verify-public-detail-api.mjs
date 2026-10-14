import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
const env = await readFile(".env.local", "utf8");
const value = (name) =>
  env.match(new RegExp(`^${name}=["']?([^\\s"']+)`, "m"))?.[1];
const client = createClient(
  value("VITE_SUPABASE_URL"),
  value("VITE_SUPABASE_PUBLISHABLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const asset = await client
  .from("detail_buildings")
  .select("id,is_igis")
  .limit(1)
  .single();
assert.ifError(asset.error);
assert(asset.data.id);
const overview = await client
  .from("detail_building_asset_profiles")
  .select("id")
  .eq("id", asset.data.id)
  .single();
assert.ifError(overview.error);
const photo = await client
  .from("detail_building_images")
  .select("object_path")
  .not("object_path", "is", null)
  .limit(1)
  .single();
assert.ifError(photo.error);
const signed = await client.storage
  .from("building-images")
  .createSignedUrl(photo.data.object_path, 60);
assert.ifError(signed.error);
assert.equal(
  (await fetch(signed.data.signedUrl, { method: "HEAD" })).status,
  200,
);
const raw = await client.from("buildings").select("id").limit(1);
assert.equal(raw.error?.code, "42501");
const internal = await client.rpc("master_asset_context", {
  building_key: asset.data.id,
});
assert.equal(internal.error?.code, "42501");
const operations = await client.rpc("igis_operation_access", {
  building_key: asset.data.id,
});
assert.equal(operations.error?.code, "42501");
console.log(
  JSON.stringify({
    anonymousDetail: true,
    overview: true,
    approvedOriginalPhoto: true,
    rawTableDenied: true,
    privateIgisDenied: true,
  }),
);
