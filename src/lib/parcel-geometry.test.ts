import { test } from "node:test";
import assert from "node:assert/strict";
import { parcelPolygons } from "./parcel-geometry.ts";

test("parcel geometry preserves multiple islands and interior holes", () => {
  const outer = [
    [126, 37],
    [127, 37],
    [127, 38],
    [126, 37],
  ];
  const hole = [
    [126.2, 37.1],
    [126.3, 37.1],
    [126.3, 37.2],
    [126.2, 37.1],
  ];
  const island = [
    [128, 37],
    [129, 37],
    [129, 38],
    [128, 37],
  ];
  assert.deepEqual(
    parcelPolygons({ type: "Polygon", coordinates: [outer, hole] }),
    [[outer, hole]],
  );
  assert.deepEqual(
    parcelPolygons({
      type: "MultiPolygon",
      coordinates: [[outer, hole], [island]],
    }),
    [[outer, hole], [island]],
  );
});
test("invalid rings cannot become a misleading map boundary", () => {
  assert.deepEqual(parcelPolygons(null), []);
  assert.deepEqual(
    parcelPolygons({
      type: "Polygon",
      coordinates: [
        [
          [126, 37],
          [127, 37],
          [127, 38],
          [128, 37],
        ],
      ],
    }),
    [],
  );
  assert.deepEqual(
    parcelPolygons({
      type: "Polygon",
      coordinates: [
        [
          [126, 137],
          [127, 137],
          [127, 138],
          [126, 137],
        ],
      ],
    }),
    [],
  );
  assert.deepEqual(
    parcelPolygons({
      type: "Polygon",
      coordinates: [
        [
          [126, 37],
          [NaN, 37],
          [127, 38],
          [126, 37],
        ],
      ],
    }),
    [],
  );
});
