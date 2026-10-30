import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadDensity,
  nearbyStations,
  certificateState,
  overviewRegisterFact,
  prepareSubwayConnections,
} from "./asset-overview.ts";
import { stationLines, stationNameOptions } from "./subway-stations.ts";
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
      [{ ...a, emergency_elevators: 0 }],
      "emergency_elevators",
    )?.value,
    0,
  );
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

test("connection edits omit untouched extra rows and preserve explicit O/X and manual line choices", () => {
  assert.deepEqual(
    prepareSubwayConnections([
      {
        station_name: " 여의도 ",
        lines: ["5호선", "9호선", "5호선"],
        direct_connection: true,
      },
      { station_name: " ", lines: [], direct_connection: null },
      { station_name: "역삼역", lines: ["2호선"], direct_connection: false },
    ]),
    [
      {
        station_name: "여의도",
        lines: ["5호선", "9호선"],
        direct_connection: true,
      },
      { station_name: "역삼역", lines: ["2호선"], direct_connection: false },
    ],
  );
  assert.deepEqual(
    prepareSubwayConnections([
      { station_name: "", lines: [], direct_connection: null },
    ]),
    [],
  );
  for (const partial of [
    { station_name: "", lines: ["5호선"], direct_connection: null },
    { station_name: "", lines: [], direct_connection: false },
  ])
    assert.throws(
      () => prepareSubwayConnections([partial]),
      /연결역 1의 역 이름/,
    );
});

test("station names resolve all transfer lines without confusing distant namesakes or unopened stops", () => {
  assert.deepEqual(stationLines(" 여의도역 "), ["5호선", "9호선"]);
  assert.deepEqual(stationLines("여의나루"), ["5호선"]);
  assert.deepEqual(stationLines("샛강역"), ["9호선", "신림선"]);
  assert.deepEqual(stationLines("경복궁(정부서울청사)역"), ["3호선"]);
  assert.deepEqual(stationLines("삼성역"), ["2호선"]);
  assert.deepEqual(
    stationLines("양평"),
    [],
    "ambiguous names require location",
  );
  assert.deepEqual(
    stationLines("양평역", { latitude: 37.5255, longitude: 126.8861 }),
    ["5호선"],
  );
  assert.deepEqual(
    stationLines("시청역", { latitude: 36.351, longitude: 127.386 }),
    [],
  );
  assert.deepEqual(stationLines("등록되지않은역"), []);
  assert(
    stationNameOptions({ latitude: 37.5217, longitude: 126.9243 }).includes(
      "여의도역",
    ),
  );
});

test("plain nearby station names show line badges and duplicate station sources merge their routes", () => {
  const place = (
    id: string,
    name: string,
    latitude: number,
    longitude: number,
  ) =>
    ({
      id,
      name,
      latitude,
      longitude,
      distance_m: 454,
      category: "transit",
    }) as Place;
  const result = nearbyStations([
    place("1", "여의나루역", 37.5271, 126.9329),
    place("2", "여의도역(5호선)", 37.5217, 126.9243),
    place("3", "여의도역(9호선)", 37.5217, 126.9243),
    place("4", "시청역", 36.351, 127.386),
  ]);
  assert.equal(result.length, 3);
  assert.deepEqual(result[0].lines, ["5호선"]);
  assert.deepEqual(result[1].lines, ["5호선", "9호선"]);
  assert.deepEqual(result[2].lines, []);
  assert(result.every((s) => !("direct_connection" in s)));
  assert.deepEqual(
    nearbyStations([place("incheon", "미등록역(인천1호선)", 37.45, 126.7)])[0]
      .lines,
    ["인천1호선"],
  );
});
