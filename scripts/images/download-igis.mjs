// Download only manually selected sources; keep all manifests private.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = "data/private/images/igis";
await mkdir(root, { recursive: true });
const plan = JSON.parse(await readFile(`${root}/plan.json`, "utf8"));
const results = JSON.parse(
  await readFile(`${root}/downloads.json`, "utf8").catch(() => "[]"),
);
const blocked = new Set();
let next = 0;
async function worker() {
  while (next < plan.length) {
    const item = plan[next++];
    if (
      results.some(
        (r) =>
          r.building_id === item.building_id &&
          r.source_image_url === item.source_image_url,
      )
    )
      continue;
    const url = new URL(item.source_image_url);
    if (!["https:", "http:"].includes(url.protocol) || blocked.has(url.host))
      continue;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if ([401, 403, 429].includes(response.status)) {
        blocked.add(url.host);
        throw Error(`access-${response.status}`);
      }
      if (!response.ok) throw Error(`http-${response.status}`);
      if (!response.headers.get("content-type")?.startsWith("image/"))
        throw Error("not-image");
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 20000000) throw Error("image-too-large");
      const sha = createHash("sha256").update(bytes).digest("hex");
      const file = `${root}/${item.building_id}-${sha.slice(0, 10)}.source`;
      await writeFile(file, bytes);
      results.push({
        ...item,
        file,
        sha,
        bytes: bytes.length,
        collected_at: new Date().toISOString(),
      });
    } catch (e) {
      console.log(`Unavailable ${item.n} ${item.name}: ${e.message}`);
    }
  }
}
await Promise.all(Array.from({ length: 5 }, worker));
await writeFile(`${root}/downloads.json`, JSON.stringify(results, null, 2));
console.log(
  JSON.stringify({
    downloaded: results.length,
    planned: plan.length,
    blockedHosts: [...blocked],
  }),
);
