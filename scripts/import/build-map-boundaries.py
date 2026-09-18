"""Build public map geometry, never asset data.

Usage: python build-map-boundaries.py /path/to/emd.shp
Requires pyshp, shapely and pyproj. Source/provenance: docs/map-boundaries.md.
"""
import json
import sys
from pathlib import Path
import shapefile
from pyproj import Transformer
from shapely.geometry import shape, mapping, MultiPolygon, Point, Polygon
from shapely.ops import unary_union, transform
from shapely import set_precision

reader = shapefile.Reader(sys.argv[1], encoding="cp949")
parts = {}
for record in reader.iterShapeRecords():
    code = record.record["EMD_CD"]
    if code.startswith("11") or code.startswith("41135"):
        geom = shape(record.shape.__geo_interface__)
        assert geom.is_valid, code
        parts[code] = set_precision(set_precision(geom, 0.1), 0)

def union(prefixes):
    return unary_union([g for code, g in parts.items() if any(code.startswith(p) for p in prefixes)])

def outer_boundary(geom):
    # The source's adjacent dong edges leave microscopic internal gaps. These
    # regions have no administrative enclaves; retain their exterior rings.
    polygons = [geom] if geom.geom_type == "Polygon" else list(geom.geoms)
    return unary_union([Polygon(p.exterior) for p in polygons])

# Simplify only in the metre-based source CRS, then subtract the very same
# geometries from Seoul so the overview has matching shared edges and holes.
seoul = outer_boundary(union(["11"])).simplify(12, preserve_topology=True)
regions = {
    "CBD": outer_boundary(union(["11110", "11140"])).simplify(12, preserve_topology=True),
    "GBD": outer_boundary(union(["11650", "11680", "11710101", "11710102"])).simplify(12, preserve_topology=True),
    "YBD": outer_boundary(parts["11560110"]).simplify(12, preserve_topology=True),
}
seoul = unary_union([seoul, *regions.values()])
regions["Others"] = seoul.difference(unary_union(list(regions.values())))
regions["BBD"] = outer_boundary(union(["41135"])).simplify(12, preserve_topology=True)

assert unary_union([regions[k] for k in ("CBD", "GBD", "YBD", "Others")]).symmetric_difference(seoul).area < .01
for key, geom in regions.items():
    assert geom.is_valid and not geom.is_empty, key
    for other, other_geom in regions.items():
        if key != other:
            assert geom.intersection(other_geom).area < .01, (key, other)

project = Transformer.from_crs(5179, 4326, always_xy=True).transform
labels = {"CBD": [126.984, 37.58], "GBD": [127.045, 37.495],
          "YBD": [126.925, 37.524], "Others": [126.90, 37.578], "BBD": [127.113, 37.385]}
features = []
geographic = {key: transform(project, geom).buffer(0) for key, geom in regions.items()}
geographic["Others"] = transform(project, seoul).buffer(0).difference(
    unary_union([geographic[k] for k in ("CBD", "GBD", "YBD")]))
for key, geo in geographic.items():
    assert geo.is_valid, key
    assert geo.contains(Point(labels[key])), key
    if geo.geom_type == "Polygon":
        geo = MultiPolygon([geo])
    features.append({"type": "Feature", "properties": {"key": key, "labelPosition": labels[key]},
                     "bbox": list(geo.bounds), "geometry": mapping(geo)})

result = {"type": "FeatureCollection", "source": "GIS Developer / GEOSERVICE; road-name address administrative boundaries",
          "sourceUrl": "http://www.gisdeveloper.co.kr/?p=2332", "sourceDate": "2023-07-29",
          "sourceDownload": "http://www.gisdeveloper.co.kr/download/admin_shp/emd_20230729.zip",
          "simplificationMetres": 12, "features": features}
target = Path(__file__).resolve().parents[2] / "src/data/district-boundaries.json"
target.parent.mkdir(exist_ok=True)
# Keep full transformed precision so repeated shared vertices remain identical.
target.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n")
print({"output": str(target), "bytes": target.stat().st_size,
       "regions_km2": {k: round(g.area / 1e6, 2) for k, g in regions.items()}})
