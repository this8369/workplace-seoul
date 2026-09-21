import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fetchRegister, OPERATIONS, validateParcel } from "./client.mjs";
const file = process.argv[2];
if (!file?.startsWith("data/private/") || !file.endsWith(".json"))
  throw new Error("Pass a private parcel plan JSON path");
const plan = JSON.parse(await readFile(file, "utf8"));
await mkdir("data/private/building-register", { recursive: true, mode: 0o700 });
try {
  for (const parcel of plan.parcels) {
    const query = validateParcel(parcel);
    const parcelKey = Object.values(query).join("-");
    for (const operation of plan.operations ?? OPERATIONS) {
      const path = `data/private/building-register/${parcelKey}-${operation}.json`;
      if (!process.argv.includes("--refresh")) {
        try {
          const cached = JSON.parse(await readFile(path, "utf8"));
          if (Date.now() - Date.parse(cached.collected_at) < 86400000) {
            console.log(
              JSON.stringify({
                parcel: parcelKey,
                operation,
                cached: true,
                rows: cached.items.length,
              }),
            );
            continue;
          }
        } catch (e) {
          if (e.code !== "ENOENT") throw e;
        }
      }
      const result = await fetchRegister(operation, query);
      result.content_hash = createHash("sha256")
        .update(JSON.stringify(result.items))
        .digest("hex");
      await writeFile(path, JSON.stringify(result, null, 2), { mode: 0o600 });
      console.log(
        JSON.stringify({
          parcel: parcelKey,
          operation,
          rows: result.items.length,
        }),
      );
      await new Promise((r) => setTimeout(r, 400));
    }
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
