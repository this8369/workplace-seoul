import { test } from "node:test";
import assert from "node:assert/strict";
import { sharedFields, scopedRows } from "./shared-asset.ts";
test("missing component fields use original shared records and retain edit destinations", () => {
  const parent = {
    id: "complex",
    height: 3,
    hotel: ["조선팰리스"],
    dual: false,
  };
  const child = {
    id: "east",
    height: null as number | null,
    hotel: [] as string[],
    dual: null as boolean | null,
  };
  const result = sharedFields(child, parent, ["height", "hotel", "dual"]);
  assert.deepEqual(result.values, {
    id: "east",
    height: 3,
    hotel: ["조선팰리스"],
    dual: false,
  });
  assert.equal(result.sourceId("height"), "complex");
  assert.equal(result.sourceId("id"), "east");
  assert.equal(child.height, null);
  assert.deepEqual(child.hotel, []);
});
test("tower overrides win and shared observations are not relabeled as tower data", () => {
  const own = { id: "east", height: 2.8, dual: false },
    shared = { id: "complex", height: 3, dual: true };
  const result = sharedFields(own, shared, ["height", "dual"]);
  assert.deepEqual(result.values, own);
  assert.equal(result.inherited.size, 0);
  assert.equal(result.sourceId("height"), "east");
  const market = [{ id: "quarter", building_id: "complex", noc: 471000 }];
  assert.deepEqual(scopedRows([], market), { rows: market, inherited: true });
  assert.deepEqual(
    scopedRows([{ id: "own", building_id: "east", noc: 123 }], market),
    { rows: [{ id: "own", building_id: "east", noc: 123 }], inherited: false },
  );
});
