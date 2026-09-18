"""Derive editorial map outlines without changing address/asset classification.

Run after build-map-boundaries.py. Requires shapely.
"""
import json
from pathlib import Path
from shapely.geometry import shape, mapping, LineString, Polygon, MultiPolygon
from shapely.ops import unary_union, transform, polylabel
from pyproj import Transformer

root = Path(__file__).resolve().parents[2]
source = json.loads((root / "src/data/district-boundaries.json").read_text())
road_data = json.loads((root / "src/data/district-road-traces.json").read_text())
# Editorial boundaries follow sampled road geometry, including road bends and
# the Jongmyo corridor, instead of latitude cuts or decorative spline curves.
masks = {}
for key, trace in road_data["traces"].items():
    points = trace["coordinates"]
    assert LineString(points).is_simple, key
    if trace.get("clipMode") == "polygon":
        mask = Polygon(points)
    else:
        closing_latitude = 37 if key == "CBD" else 38
        mask = Polygon([(126, points[0][1]), *points, (128, points[-1][1]),
                        (128, closing_latitude), (126, closing_latitude)])
    assert mask.is_valid, key
    masks[key] = mask
features = []
trimmed = []
for feature in source["features"]:
    key = feature["properties"]["key"]
    if key not in masks:
        continue
    original = shape(feature["geometry"])
    clipped = original.intersection(masks[key])
    assert clipped.is_valid and not clipped.is_empty
    assert clipped.area < original.area
    assert original.buffer(1e-10).covers(clipped)
    if key in ("CBD", "GBD"):
        trimmed.append(original.difference(clipped))
    if clipped.geom_type == "Polygon":
        clipped = MultiPolygon([clipped])
    assert clipped.geom_type == "MultiPolygon"
    properties = dict(feature["properties"])
    if key == "CBD":
        properties["labelPosition"] = [126.986, 37.5638]
    features.append({**feature, "properties": properties,
                     "bbox": list(clipped.bounds), "geometry": mapping(clipped)})
# Merge trimmed hills into the surrounding display background so old CBD/GBD
# hole edges do not remain as misleading ghost outlines behind the new cuts.
others = next(f for f in source["features"] if f["properties"]["key"] == "Others")
geo = unary_union([shape(others["geometry"]), *trimmed]).buffer(0)
assert geo.is_valid and not geo.is_empty
if geo.geom_type == "Polygon":
    geo = MultiPolygon([geo])
features.append({**others, "bbox": list(geo.bounds), "geometry": mapping(geo)})
# Place labels at projected area centroids, falling back to the widest interior
# point where an irregular region's centroid falls in a hole or outside its edge.
features.extend(f for f in source["features"] if f["properties"]["key"] == "YBD")
forward = Transformer.from_crs(4326, 3857, always_xy=True).transform
inverse = Transformer.from_crs(3857, 4326, always_xy=True).transform
for feature in features:
    projected = transform(forward, shape(feature["geometry"]))
    point = projected.centroid
    if not projected.contains(point):
        point = polylabel(max(projected.geoms, key=lambda g: g.area), tolerance=10)
    point = transform(inverse, point)
    feature["properties"] = {**feature["properties"], "labelPosition": [point.x, point.y]}
target = root / "src/data/district-display-boundaries.json"
target.write_text(json.dumps({"type": "FeatureCollection", "roadSource": road_data["source"],
                             "roadSourceUrl": road_data["sourceUrl"], "roadLicense": road_data["license"],
                             "features": features},
                             ensure_ascii=False, separators=(",", ":")) + "\n")
print(f"Wrote {len(features)} display-only boundaries to {target.name}")
