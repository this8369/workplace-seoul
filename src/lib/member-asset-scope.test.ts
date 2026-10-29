import test from "node:test";
import assert from "node:assert/strict";
import { createMemberAssetScope } from "./member-asset-scope.ts";
import type { BuildingComplex } from "./building-towers.ts";
const seed = {
  complex: { id: "complex" } as BuildingComplex,
  members: [],
  towers: [],
};
test("one complex revision shares public requests across towers and retries failures", async () => {
  const scope = createMemberAssetScope(seed);
  let calls = 0;
  const load = async () => {
    calls++;
    return { name: "공통 자료" };
  };
  const [a, b] = await Promise.all([
    scope.read("parent", load),
    scope.read("parent", load),
  ]);
  assert.equal(calls, 1);
  assert.equal(a, b);
  await scope.read("parent", load);
  assert.equal(calls, 1);
  let failures = 0;
  const fail = () => {
    failures++;
    throw Error("offline");
  };
  await assert.rejects(scope.read("retry", fail));
  await assert.rejects(scope.read("retry", fail));
  assert.equal(failures, 2);
});
test("closing or refreshing a complex never reuses its previous response cache", async () => {
  const first = createMemberAssetScope(seed),
    next = createMemberAssetScope(seed);
  assert.equal(await first.read("same-asset", async () => 1), 1);
  assert.equal(await next.read("same-asset", async () => 2), 2);
});
