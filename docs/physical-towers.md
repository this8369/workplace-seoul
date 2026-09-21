# Physical towers and map presentation

Rental floor bands are not asset identities. Current asset labels and future
imports strip low/mid/high annotations and named floor ranges, preserving A/B,
East/West and tower numbers. Historical source snapshots remain private evidence.

`building_complexes` holds the map name, representative source record and a
non-duplicated gross area. Existing `buildings` retain their IDs, favorites,
transactions and tenant histories and reference the complex through `complex_id`.
`building_towers` stores each physical tower's rentable and exclusive typical-floor
areas with its own source URL, source period, collection timestamp and content hash.
An optional verified `building_id` links a tower to existing NOC observations.
Whole-complex NOC is never copied into every tower.

The map projects related source records into one marker. Its resting appearance
continues to show the area strip and complex name; hover or keyboard focus expands
the independently sourced floor values, such as `A동 800평 / B동 650평`. Detail pages
show the same values and per-tower source links. The source record list is retained;
this change does not merge or delete source building records.

Source ingestion uses a private reviewed plan at
`data/private/tower-import-plan.json`. The generic importer is
`scripts/officefind/import-towers.mjs`; without `--apply` it only collects and
validates. It reuses cached public pages, makes uncached requests sequentially,
and stops on access challenges. Name/address/coordinate and unit checks precede
the transaction. Missing source values stay null. The private resulting manifest
is verified against Supabase by `scripts/db/verify.mjs`.

At the initial import, 19 complexes contain 38 tower records: 35 have both floor
measurements. Signature Towers East/West and Samsung SDS Jamsil West have no
independently identified Officefind floor specifications; their values remain
unknown. No NOC observations or asset eligibility thresholds were changed.

Before adding another complex, distinguish aggregate gross area from component
gross areas. Never sum an aggregate record and its components, repeat the same
whole-site area for every tower, or automatically combine unrelated buildings
sharing an address. A new standalone building must still meet the 10,000-pyeong
eligibility rule. A source page per tower does not by itself prove that a site's
physical tower inventory is complete.
