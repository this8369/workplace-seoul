import { test } from "node:test";
import assert from "node:assert/strict";
import { createSignedImageLoader } from "./signed-image-loader.ts";

test("visible image requests share a batch and duplicate mounts reuse one URL", async () => {
  const batches: string[][] = [];
  const loader = createSignedImageLoader(async (paths) => {
    batches.push(paths);
    return paths.map((path) => ({
      path,
      signedUrl: "https://example.com/" + path,
    }));
  });
  const result = await Promise.all([
    loader.get("a"),
    loader.get("b"),
    loader.get("a"),
  ]);
  assert.deepEqual(batches, [["a", "b"]]);
  assert.equal(result[0], result[2]);
  await loader.get("a");
  assert.equal(batches.length, 1);
  loader.invalidate("a");
  await loader.get("a");
  assert.equal(batches.length, 2);
});
test("reload reuses unexpired URLs, but expired cache and failed requests are refreshed", async () => {
  let calls = 0;
  const loader = createSignedImageLoader(
    async (paths) => {
      calls++;
      if (calls === 1) throw new Error("offline");
      return paths.map((path) => ({ path, signedUrl: "new" }));
    },
    {
      read: () => ({
        fresh: { url: "cached", expires: Date.now() + 60000 },
        expired: { url: "old", expires: 0 },
      }),
      write: () => {},
    },
  );
  assert.equal(await loader.get("fresh"), "cached");
  assert.equal(calls, 0);
  await assert.rejects(loader.get("expired"), /offline/);
  assert.equal(await loader.get("expired"), "new");
  assert.equal(calls, 2);
});
test("many visible requests are bounded to 32 paths per batch and two simultaneous requests", async () => {
  let active = 0,
    max = 0;
  const batches: number[] = [];
  const loader = createSignedImageLoader(async (paths) => {
    active++;
    max = Math.max(max, active);
    batches.push(paths.length);
    await new Promise((r) => setTimeout(r, 30));
    active--;
    return paths.map((path) => ({ path, signedUrl: path }));
  });
  const results = await Promise.all(
    Array.from({ length: 100 }, (_, i) => loader.get(String(i))),
  );
  assert.equal(results.length, 100);
  assert.equal(
    batches.reduce((a, b) => a + b, 0),
    100,
  );
  assert.ok(batches.every((n) => n <= 32));
  assert.ok(max <= 2);
});
