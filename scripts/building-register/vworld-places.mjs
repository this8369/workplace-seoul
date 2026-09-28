import { connectDatabase, vworldClient } from "./vworld-client.mjs";
const request = await vworldClient(),
  db = await connectDatabase(),
  apply = process.argv.includes("--apply");
const queries = [
  ["지하철역", "transit", /지하철역$/],
  ["버스정류장", "transit", /버스정류장/],
  ["학교", "education", /학교|대학교/],
  ["병원", "amenity", /병원|의원/],
  ["은행", "amenity", /은행/],
  ["편의점", "amenity", /편의점/],
  ["공공기관", "amenity", /공공기관|행정기관|관공서/],
];
function distance(lat, lon, y, x) {
  const rad = Math.PI / 180,
    a =
      Math.sin(((y - lat) * rad) / 2) ** 2 +
      Math.cos(lat * rad) *
        Math.cos(y * rad) *
        Math.sin(((x - lon) * rad) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}
let done = 0,
  count = 0;
try {
  const buildings = (
    await db.query(
      "select id,latitude,longitude from buildings where latitude is not null and longitude is not null order by id",
    )
  ).rows;
  let index = 0;
  // Fetch concurrently, but commit each building atomically with a separate client.
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      const writer = await connectDatabase();
      try {
        while (index < buildings.length) {
          const b = buildings[index++],
            lat = Number(b.latitude),
            lon = Number(b.longitude),
            dy = 1000 / 110500,
            dx = 1000 / (110500 * Math.cos((lat * Math.PI) / 180));
          const bbox = [lon - dx, lat - dy, lon + dx, lat + dy].join(",");
          const places = new Map();
          for (const [query, category, accept] of queries) {
            for (let page = 1; ; page++) {
              const result = (
                await request(
                  "/req/search",
                  {
                    service: "search",
                    version: "2.0",
                    request: "search",
                    format: "json",
                    size: "1000",
                    page: String(page),
                    query,
                    type: "PLACE",
                    bbox,
                    crs: "EPSG:4326",
                  },
                  `${b.id}-places-${query}-${page}`,
                )
              ).response;
              if (result?.status === "NOT_FOUND") break;
              if (result?.status !== "OK")
                throw new Error("Invalid VWorld place response");
              for (const p of result.result?.items ?? []) {
                const y = Number(p.point?.y),
                  x = Number(p.point?.x);
                if (
                  !Number.isFinite(y) ||
                  !Number.isFinite(x) ||
                  !accept.test(p.category ?? "")
                )
                  continue;
                const meters = distance(lat, lon, y, x);
                if (meters > 1000) continue;
                const name = String(p.title ?? "").trim();
                if (!name) continue;
                const key = p.id ?? `${name}:${y}:${x}`;
                places.set(key, {
                  building_id: b.id,
                  category,
                  name,
                  address: p.address?.road || p.address?.parcel || null,
                  latitude: y,
                  longitude: x,
                  distance_m: Math.round(meters),
                  source_name: "VWorld 장소 검색",
                  source_url: "https://www.vworld.kr/dev/v4dv_search2_s001.do",
                  verified: true,
                });
              }
              if (page >= Number(result.page?.total ?? 1)) break;
              if (page >= 100) throw new Error("Incomplete place pagination");
            }
          }
          // Multiple provider records can describe one facility. Keep the nearest duplicate.
          const rows = [];
          for (const p of [...places.values()].sort(
            (a, b) => a.distance_m - b.distance_m,
          )) {
            const normalized = p.name.replace(/\([^)]*\)|\s/g, "");
            if (
              rows.some(
                (r) =>
                  r.category === p.category &&
                  r.name.replace(/\([^)]*\)|\s/g, "") === normalized &&
                  distance(r.latitude, r.longitude, p.latitude, p.longitude) <
                    150,
              )
            )
              continue;
            rows.push(p);
          }
          if (apply) {
            await writer.query("begin");
            try {
              await writer.query(
                "delete from building_places where building_id=$1 and source_name='VWorld 장소 검색'",
                [b.id],
              );
              if (rows.length) {
                const cols = Object.keys(rows[0]).join(",");
                await writer.query(
                  `insert into building_places(${cols}) select ${cols} from jsonb_populate_recordset(null::building_places,$1::jsonb)`,
                  [JSON.stringify(rows)],
                );
              }
              await writer.query("commit");
            } catch (e) {
              await writer.query("rollback");
              throw e;
            }
          }
          count += rows.length;
          done++;
          if (done % 25 === 0)
            console.log(
              JSON.stringify({ done, total: buildings.length, places: count }),
            );
        }
      } finally {
        await writer.end();
      }
    }),
  );
  console.log(JSON.stringify({ apply, buildings: done, places: count }));
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
