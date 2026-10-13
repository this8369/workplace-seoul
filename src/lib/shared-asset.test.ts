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

// Complex overview has a canonical source even when values exist in both rows.
import { overviewFields } from "./shared-asset.ts";
test("common overview edits use one source; empty shared values remain empty", () => {
  const east = {
    id: "east",
    owner: "old east" as string | null,
    height: 3,
    office: 100,
    retail: 20,
  };
  const common = {
    id: "complex",
    owner: null,
    height: 4,
    office: 500,
    retail: 80,
  };
  const west = {
    ...east,
    id: "west",
    owner: "old west" as string | null,
    height: 2.7,
  };
  const a = overviewFields(east, common, ["owner", "retail"]);
  const b = overviewFields(west, common, ["owner", "retail"]);
  assert.equal(a.values?.owner, null);
  assert.equal(a.sourceId("owner"), b.sourceId("owner"));
  assert.equal(a.values?.retail, 80);
  assert.equal(a.values?.height, 3);
  assert.equal(b.values?.height, 2.7);
  assert.equal(a.sourceId("height"), "east");
  assert.equal(b.sourceId("height"), "west");
  assert.equal(a.values?.office, 100);
});
