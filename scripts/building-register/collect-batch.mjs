import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fetchRegister, validateParcel, OPERATIONS } from "./client.mjs";
const path = process.argv[2];
if (!path?.startsWith("data/private/") || !path.endsWith(".json"))
  throw new Error("Private plan required");
const plan = JSON.parse(await readFile(path, "utf8"));
const operations = plan.operations ?? OPERATIONS;
const tasks = plan.parcels.flatMap((p) =>
  operations.map((operation) => ({ query: validateParcel(p), operation })),
);
await mkdir("data/private/building-register", { recursive: true, mode: 0o700 });
let cursor = 0,
  done = 0,
  stop = false;
const failures = [];
async function worker() {
  while (!stop && cursor < tasks.length) {
    const task = tasks[cursor++],
      key = Object.values(task.query).join("-"),
      file = `data/private/building-register/${key}-${task.operation}.json`;
    let requested = false;
    try {
      let cached;
      try {
        cached = JSON.parse(await readFile(file, "utf8"));
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      if (
        !cached ||
        Date.now() - Date.parse(cached.collected_at) > 86400000 ||
        cached.items.some((r) =>
          [r.mgmBldrgstPk, r.mgmUpBldrgstPk].some(
            (v) => typeof v === "number" && !Number.isSafeInteger(v),
          ),
        )
      ) {
        requested = true;
        const result = await fetchRegister(task.operation, task.query);
        result.content_hash = createHash("sha256")
          .update(JSON.stringify(result.items))
          .digest("hex");
        await writeFile(file, JSON.stringify(result), { mode: 0o600 });
      }
      done++;
    } catch (e) {
      failures.push({
        parcel: key,
        operation: task.operation,
        error: e.message,
      });
      if (/code (20|22|30|31|32)|HTTP 429/.test(e.message)) stop = true;
    }
    if ((done + failures.length) % 25 === 0)
      console.log(
        JSON.stringify({ done, failed: failures.length, total: tasks.length }),
      );
    if (requested) await new Promise((r) => setTimeout(r, 250));
  }
}
await Promise.all([worker(), worker(), worker()]);
await writeFile(
  path.replace(".json", "-collection.json"),
  JSON.stringify(
    { done, total: tasks.length, stopped: stop, failures },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    done,
    total: tasks.length,
    failed: failures.length,
    stopped: stop,
  }),
);
if (failures.length) process.exitCode = 1;
