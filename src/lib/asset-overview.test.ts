import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadDensity,
  nearbyStations,
  certificateState,
  overviewRegisterFact,
} from "./asset-overview.ts";
import type { Place } from "./asset-context.ts";
import type { RegisterRecord } from "./building-register.ts";
test("overview prefers official total register without mixing individual building totals or unrelated parcels", () => {
  const total = {
    id: "total",
    record_kind: "complex",
    gross_area_m2: 1000,
    site_area_m2: 100,
  } as unknown as RegisterRecord;
  const a = {
    id: "a",
    record_kind: "building",
    gross_area_m2: 400,
    parking_indoor_self: 10,
    parking_outdoor_self: 0,
    parking_indoor_mechanical: 0,
    parking_outdoor_mechanical: 2,
  } as unknown as RegisterRecord;
  const b = { ...a, id: "b", gross_area_m2: 600 };
  assert.equal(
    overviewRegisterFact([total, a, b], "gross_area_m2")?.value,
    1000,
  );
  assert.equal(overviewRegisterFact([a, b], "gross_area_m2"), null);
  assert.equal(overviewRegisterFact([a], "parking_total")?.value, 12);
  assert.equal(
    overviewRegisterFact(
      [{ ...a, parking_outdoor_self: null }],
      "parking_total",
    ),
    null,
  );
  assert.equal(
    overviewRegisterFact(
      [{ ...total, floor_area_ratio: 0 }],
      "floor_area_ratio",
    ),
    null,
  );
});
test("power density uses exact gross pyeong and does not invent missing/zero denominators", () => {
  assert.equal(loadDensity(34, (140119 * 400) / 121), 34e6 / 140119);
  assert.equal(loadDensity(0, 100), 0);
  for (const v of [null, 0, -1, NaN]) assert.equal(loadDensity(34, v), null);
  assert.equal(loadDensity(null, 100), null);
});
test("nearby transit is limited to 500m and never confused with bus stops or direct connections", () => {
  const place = (id: string, name: string, distance_m: number | null) =>
    ({ id, name, distance_m, category: "transit" }) as Place;
  const result = nearbyStations([
    place("1", "역삼역(2호선)", 499),
    place("2", "역삼역(2호선)", 480),
    place("3", "강남역(2호선)", 501),
    place("4", "공원역 버스정류장", 20),
    place("5", "미확인역", null),
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].distance_m, 480);
  assert.deepEqual(result[0].lines, ["2호선"]);
  assert(!("direct_connection" in result[0]));
});
test("expired certificates no longer display as currently certified", () => {
  assert.equal(
    certificateState(
      { option_code: "leed_4", status: "certified", expires_on: "2025-01-01" },
      "2026-10-13",
    ),
    "expired",
  );
  assert.equal(
    certificateState(
      { option_code: "leed_4", status: "planned" },
      "2026-10-13",
    ),
    "planned",
  );
});
