# Map region boundaries

The first map view uses actual legal-dong boundary geometry, dissolved into the product's five regions. These are product regions defined by geography, not a claim about market grading.

| Region | Included geography | Legal-dong code selection |
| --- | --- | --- |
| CBD | Jongno-gu and Jung-gu, Seoul | 11110*, 11140* |
| GBD | Gangnam-gu, Seocho-gu, plus only Jamsil-dong and Sincheon-dong in Songpa-gu | 11680*, 11650*, 11710101, 11710102 |
| YBD | Yeouido-dong | 11560110 |
| Others | Seoul minus CBD, GBD and YBD | 11* minus the above |
| BBD | Bundang-gu, Seongnam, including Pangyo within Bundang-gu | 41135* |

## Source and reproducibility

- Provider: [GIS Developer / GEOSERVICE](http://www.gisdeveloper.co.kr/?p=2332), derived by the provider from road-name address administrative boundaries, with corrections. The page permits use and requests attribution; the map includes a provider link.
- Pinned dataset: **2023-07-29**, [legal-dong SHP download](http://www.gisdeveloper.co.kr/download/admin_shp/emd_20230729.zip). This is the accessible archived release, **not a claim that boundaries were verified against 2026 changes**. Newer releases are distributed through GEOSERVICE's separate archive.
- Input CRS: EPSG:5179 (GRS80 UTM-K); output GeoJSON coordinates: EPSG:4326, longitude first.
- Regenerate: `python scripts/import/build-map-boundaries.py /path/to/emd.shp` with `pyshp`, `shapely` and `pyproj` installed. The script writes `src/data/district-boundaries.json` only. No private asset records or API credentials are embedded.
- Processing: dissolve legal-dong polygons; snap sub-metre source noise to a 0.1 m grid; remove internal seam gaps within regions without administrative enclaves; simplify exterior boundaries with a 12 m tolerance. Unite the simplified Seoul exterior with its three constituent regions to keep their shared edges covered. Compute Others by geometric subtraction and preserve its holes and separate parts. Repair floating-point geometry after projection.
- This geometry supports map exploration, not cadastral or parcel-boundary determination. Canonical lot addresses take precedence for asset classification near simplified boundaries. Imported DB region fields are retained; the app derives display regions at the read boundary so filters, cards and map counts agree.

## Interaction

At zoom 12 and below, show distinct regional fills, 3px exterior lines and compact rectangular labels with filtered record counts. CBD uses indigo, GBD violet, YBD teal, BBD blue and Others slate. Hovering a polygon, label or top region control strengthens its entire regional fill and outline; keyboard focus on labels and controls provides the same emphasis. Polygons, labels and the top region controls fit the complete selected geographic bounds, including padding for controls, except for Seoul Others: it opens at zoom 14 around Sindorim (37.509, 126.891) rather than the centre of the dispersed region’s bounding box. This navigation choice does not change region membership or geometry. Region navigation remains available when filters return zero records. Zooming back out or choosing 전체 restores the overview. Higher zooms retain proximity clustering, individual building selection and the collocated-record list. Returning from details preserves the camera and selected region.

Coverage tests exercise Jongno, Jung, Gangnam, Seocho, Jamsil, Sincheon, Yeouido and Bundang; verify that Munjeong and Yongsan remain Others and Sujeong/Incheon are outside these regions; and check ring closure, bounds, label containment and non-overlapping sampled membership.
