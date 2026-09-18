import { test } from "node:test";
import assert from "node:assert/strict";
import {
  boundaries,
  homeMapCenter,
  displayBoundaries,
  boundaryContains,
  districtAt,
  regionForBuilding,
} from "./map-regions.ts";

test("editorial mountain trims preserve central districts and source classification", () => {
  const cbd = displayBoundaries.find((b) => b.properties.key === "CBD")!;
  const gbd = displayBoundaries.find((b) => b.properties.key === "GBD")!;
  const bbd = displayBoundaries.find((b) => b.properties.key === "BBD")!;
  assert.equal(boundaryContains(cbd, 126.977, 37.58), false); // Palace north of Line 3
  assert.equal(boundaryContains(cbd, 126.977, 37.571), true); // Gwanghwamun business area
  assert.equal(boundaryContains(cbd, 126.994, 37.574), true); // Jongmyo corridor
  assert.equal(boundaryContains(cbd, 126.98, 37.62), false); // Northern mountains
  assert.equal(boundaryContains(gbd, 127.027, 37.498), true); // Gangnam Station
  assert.equal(boundaryContains(gbd, 127.047, 37.486), true); // Maebong
  assert.equal(boundaryContains(gbd, 127.05, 37.47), false); // Guryongsan
  assert.equal(boundaryContains(gbd, 127.079, 37.474), false); // Daemosan
  assert.equal(boundaryContains(gbd, 126.998, 37.488), false); // Seoripul western park
  assert.equal(boundaryContains(gbd, 127.007, 37.499), false); // Northern park interior
  assert.equal(boundaryContains(gbd, 127.0022505, 37.4908867), true); // Seoripul north site
  assert.equal(boundaryContains(gbd, 127.0027062, 37.4890245), true); // Seoripul south site
  assert.equal(boundaryContains(gbd, 127.0008548, 37.4886), true); // South site western edge
  assert.equal(boundaryContains(gbd, 127.0078, 37.4919), true); // Seocho Station
  assert.equal(districtAt(126.998, 37.488), "GBD");
  assert.equal(
    gbd.bbox[3],
    boundaries.find((b) => b.properties.key === "GBD")!.bbox[3],
  );
  assert.equal(districtAt(126.98, 37.62), "CBD");
  assert.equal(districtAt(127.05, 37.47), "GBD");
  for (const [lng, lat] of [
    [127.1112, 37.3948], // Pangyo Station
    [127.1005, 37.402], // Pangyo Techno Valley
    [127.123, 37.385], // Seohyeon Station
    [127.108, 37.366], // Jeongja Station
    [127.109, 37.35], // Migeum Station
    [127.108, 37.34], // Ori Station
    [127.128, 37.411], // Yatap Station
  ])
    assert.equal(boundaryContains(bbd, lng, lat), true);
  for (const [lng, lat] of [
    [127.075, 37.391], // West Pangyo, west of Gyeongbu Expressway
    [127.165, 37.401], // Yeongjangsan
    [127.13, 37.354], // Bulgoksan western slope within Bundang-gu
  ]) {
    assert.equal(boundaryContains(bbd, lng, lat), false);
    assert.equal(districtAt(lng, lat), "BBD");
    assert.equal(
      boundaryContains(
        displayBoundaries.find((b) => b.properties.key === "Others")!,
        lng,
        lat,
      ),
      false,
    );
  }
  for (const boundary of displayBoundaries) {
    const [lng, lat] = boundary.properties.labelPosition;
    assert.ok(boundaryContains(boundary, lng, lat));
    if (boundary.properties.key === "YBD")
      assert.deepEqual(
        boundary.geometry,
        boundaries.find((b) => b.properties.key === boundary.properties.key)!
          .geometry,
      );
  }
});

test("real geographic regions include intended neighbourhoods and exclude adjacent districts", () => {
  const places: [number, number, string | undefined][] = [
    [126.978, 37.566, "CBD"], // City Hall, Jung-gu
    [126.983, 37.573, "CBD"], // Jongno
    [127.036, 37.5, "GBD"], // Yeoksam
    [127.01, 37.483, "GBD"], // Seocho
    [127.103, 37.514, "GBD"], // Sincheon-dong
    [127.082, 37.509, "GBD"], // Jamsil-dong
    [126.925, 37.524, "YBD"],
    [127.111, 37.395, "BBD"], // Pangyo
    [127.108, 37.366, "BBD"], // Jeongja
    [127.12, 37.485, "Others"], // Munjeong is not GBD
    [126.9, 37.52, "Others"], // Yeongdeungpo outside Yeouido
    [126.97, 37.529, "Others"], // Yongsan is not CBD
    [127.127, 37.444, undefined], // Sujeong is not BBD
    [126.72, 37.5, undefined], // Incheon is not Seoul Others
  ];
  for (const [lng, lat, expected] of places) {
    assert.equal(districtAt(lng, lat), expected, `${lng},${lat}`);
    const hits = boundaries.filter((b) => boundaryContains(b, lng, lat));
    assert.equal(hits.length, expected ? 1 : 0, "no overlapping region fill");
  }
});

test("boundary bounds enclose every vertex, rings close and labels sit in their own regions", () => {
  assert.equal(boundaries.length, 5);
  for (const boundary of boundaries) {
    const {
      key,
      labelPosition: [lng, lat],
    } = boundary.properties;
    assert.equal(districtAt(lng, lat), key);
    const [w, s, e, n] = boundary.bbox;
    for (const polygon of boundary.geometry.coordinates)
      for (const ring of polygon) {
        assert.ok(ring.length >= 4);
        assert.deepEqual(ring[0], ring.at(-1));
        for (const [x, y] of ring)
          assert.ok(x >= w && x <= e && y >= s && y <= n);
      }
  }
});

test("canonical legal-dong address wins over imported region labels and uncertain coordinates", () => {
  const classify = (address: string, region = "Others") =>
    regionForBuilding({
      address,
      region,
      latitude: null,
      longitude: null,
    });
  assert.equal(classify("서울특별시 송파구 신천동 29"), "GBD");
  assert.equal(classify("서울 송파구 잠실동 1"), "GBD");
  assert.equal(classify("서울특별시 송파구 문정동 651-8", "GBD"), "Others");
  assert.equal(classify("서울특별시 영등포구 여의도동 23"), "YBD");
  assert.equal(classify("서울특별시 용산구 동자동 12", "CBD"), "Others");
  assert.equal(classify("경기도 성남시 분당구 삼평동 681"), "BBD");
  assert.equal(
    regionForBuilding({
      address: "서울 송파구 올림픽로 300",
      region: "Others",
      latitude: 37.514,
      longitude: 127.103,
    }),
    "GBD",
  );
  assert.equal(
    regionForBuilding({
      address: "서울 송파구 문정동 651",
      region: "GBD",
      latitude: 37.514,
      longitude: 127.103,
    }),
    "Others",
  );
  assert.equal(classify("", "미확인"), "미확인");
});

test("home center balances CBD, GBD and YBD without Seoul Others or BBD", () => {
  const center = homeMapCenter();
  assert.ok(Math.abs(center.latitude - 37.53334035550666) < 0.000001);
  assert.ok(Math.abs(center.longitude - 126.99108000230602) < 0.000001);
  const shifted = displayBoundaries.map((b) =>
    ["Others", "BBD"].includes(b.properties.key)
      ? {
          ...b,
          properties: {
            ...b.properties,
            labelPosition: [130, 39] as [number, number],
          },
        }
      : b,
  );
  assert.deepEqual(homeMapCenter(shifted), center);
});
