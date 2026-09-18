# Address master and map

The native source workbook retains raw addresses. `01 건물원장` contains canonical lot address, road address, geocoding status/date/provider and coordinates. `04 거래원장` and `05 임차이전` use the same convention. Column headers and stable UUIDs are authoritative; column positions are not.

- Expand provincial/city abbreviations and normalize whitespace. Seongnam/Bundang omissions are repaired explicitly.
- Transaction input has separate main/sub lot numbers. Join with a hyphen, omitting zero sub-lots. Never apply that rule to arbitrary address text.
- Preserve empty and missing source values, without inventing a location.
- Accept Naver results only when the complete administrative/lot address matches and yields a unique coordinate pair within Korea.
- A lot match does not verify the building identity, tower, floor interests, entrance or current development status. Keep each asset UUID; never merge on address alone.
- `buildings.address` remains the source value. The app displays `standard_address`, falling back to source, and searches road addresses too. Existing draft/publication rules remain unchanged.

## Controlled enrichment

Read current native Sheet metadata and bounded CellData through the Google Drive connector. Resolve source address and ID columns by their header names. Save only the requested records to ignored `data/private/address-source.json` as `{kind, side, id, row, source}`; `row` is a zero-based sheet row index, excluding the header at 0. Kinds: `building`, `transaction`, `movement`; sides: `address`, or `from`/`to` for movements.

`node --use-system-ca scripts/db/normalize-sheet-addresses.mjs` produces an ignored report and caches provider responses. Review it before running with `--apply`. The database write is transactional, preserves source addresses and existing coordinates, and stores an audit snapshot in the private schema. Unexpected source/coordinate changes abort the transaction. `verify-addresses.mjs` compares the actual DB with the report.

Re-read Sheet IDs/source values immediately before connector writes. Update canonical columns only, preserve formulas/raw columns/native tables, and verify every changed value after writing. This is a controlled import, **not automatic two-way synchronization**. API keys, original records and reports never belong in the public repository.

## Map behavior

At zoom 12 and below, show actual region boundary outlines with record counts for CBD, GBD, YBD, Seoul Others and BBD. The legal-dong definitions, public geometry source, vintage and processing are documented in [map-boundaries.md](map-boundaries.md). Display regions are derived from canonical addresses, with geometry fallback for incomplete addresses, while imported DB region values remain unchanged. Clicking a region fits its geographic extent and enters asset exploration. Location-pending assets remain in regional counts and are disclosed separately. Higher zooms group confirmed coordinates by screen-scale proximity, separating as the user zooms in. Clicking a group zooms in; dense/collocated records can be individually selected from a list at zoom 19+. Details return to the previous camera and selected region. Counts represent source asset records, which can include multiple towers, interests and development records at one address.
