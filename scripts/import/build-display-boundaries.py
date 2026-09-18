"""Derive editorial map outlines without changing address/asset classification.

Run after build-map-boundaries.py. Requires shapely.
"""
import json
from pathlib import Path
from shapely.geometry import shape, mapping, box, Polygon, MultiPolygon
from shapely.ops import unary_union

root = Path(__file__).resolve().parents[2]
source = json.loads((root / "src/data/district-boundaries.json").read_text())
# Keep Gyeongbokgung, trim the northern mountain extension. The GBD cut follows
# an editorial foothill line below the built-up area, not a new legal boundary.
masks = {
    "CBD": box(126, 37, 128, 37.587),
    "GBD": Polygon([
        (126.9, 37.465), (127.015, 37.465), (127.035, 37.478),
        (127.06, 37.482), (127.085, 37.48), (127.12, 37.477),
        (127.2, 37.477), (127.2, 38), (126.9, 38),
    ]),
}
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
    trimmed.append(original.difference(clipped))
    if clipped.geom_type == "Polygon":
        clipped = MultiPolygon([clipped])
    assert clipped.geom_type == "MultiPolygon"
    features.append({**feature, "bbox": list(clipped.bounds), "geometry": mapping(clipped)})
# Merge trimmed hills into the surrounding display background so old CBD/GBD
# hole edges do not remain as misleading ghost outlines behind the new cuts.
others = next(f for f in source["features"] if f["properties"]["key"] == "Others")
geo = unary_union([shape(others["geometry"]), *trimmed]).buffer(0)
assert geo.is_valid and not geo.is_empty
if geo.geom_type == "Polygon":
    geo = MultiPolygon([geo])
features.append({**others, "bbox": list(geo.bounds), "geometry": mapping(geo)})
target = root / "src/data/district-display-boundaries.json"
target.write_text(json.dumps({"type": "FeatureCollection", "features": features},
                             ensure_ascii=False, separators=(",", ":")) + "\n")
print(f"Wrote {len(features)} display-only boundaries to {target.name}")
