import { test } from "node:test";
import assert from "node:assert/strict";
import { createCatalogRequests } from "./catalog-requests.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test("post-save catalog refresh waits out an older read and never returns its stale name", async () => {
  const oldRead = deferred<string>();
  let calls = 0;
  const requests = createCatalogRequests(() => {
    calls++;
    return calls === 1 ? oldRead.promise : Promise.resolve("새 이름");
  });
  const initial = requests.read();
  assert.equal(requests.read(), initial, "ordinary parallel reads are shared");
  const saved = requests.fresh();
  oldRead.resolve("이전 이름");
  assert.equal(await initial, "이전 이름");
  assert.equal(await saved, "새 이름");
  assert.equal(calls, 2);
});

test("a failed earlier catalog read cannot block saved data from reloading", async () => {
  const oldRead = deferred<string>();
  let calls = 0;
  const requests = createCatalogRequests(() =>
    ++calls === 1 ? oldRead.promise : Promise.resolve("저장한 이름"),
  );
  const initial = requests.read();
  const saved = requests.fresh();
  const failure = assert.rejects(initial, /offline/);
  oldRead.reject(new Error("offline"));
  await failure;
  assert.equal(await saved, "저장한 이름");
  assert.equal(calls, 2);
});

test("a later save reloads again after a previous post-save read has started", async () => {
  const first = deferred<string>();
  let calls = 0;
  const requests = createCatalogRequests(() =>
    ++calls === 1 ? first.promise : Promise.resolve("두 번째 변경"),
  );
  const firstSave = requests.fresh();
  const secondSave = requests.fresh();
  first.resolve("첫 번째 변경");
  assert.equal(await firstSave, "첫 번째 변경");
  assert.equal(await secondSave, "두 번째 변경");
  assert.equal(calls, 2);
});
