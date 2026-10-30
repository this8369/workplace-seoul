// Separate co-located leasing assets; keep original market and photo records.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { connectDatabase } from "../building-register/vworld-client.mjs";
import { dcubeIdentities } from "../officefind/dcube-identities.mjs";
import { parseOffice, plain } from "../officefind/parser.mjs";
import { matchFloorIdentity } from "../officefind/reviewed-floor-identities.mjs";
const [spaceK, timewalk] = dcubeIdentities;
const complexId = "c5b8632a-3ec0-5d6b-ac11-8029f3f22c4c";
const root = "data/private/dcube-repair";
const apply = process.argv.includes("--apply");
await mkdir(root, { recursive: true });
const sourceFile = (item) => `${root}/source-${item.id}.json`;
const rowHtml = (html, label) =>
  html.match(
    new RegExp(
      `<th[^>]*>\\s*${label}\\s*</th>\\s*<td[^>]*>([\\s\\S]*?)</td>`,
      "i",
    ),
  )?.[1] || "";
if (process.argv.includes("--prepare")) {
  for (const item of dcubeIdentities) {
    const url = new URL(item.path, "https://officefind.co.kr").href;
    const response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    assert(response.ok, `Source HTTP ${response.status}`);
    const html = await response.text();
    assert(
      !/cf-chl-|verify you are human|access denied|captcha challenge/i.test(
        html,
      ),
      "Source access challenge",
    );
    const spec = parseOffice(html, url);
    assert(matchFloorIdentity(item, spec).ok);
    assert.deepEqual(spec.warnings, []);
    const source = {
      ...spec,
      gross: plain(rowHtml(html, "연면적")),
      gross_area_m2: Number(
        plain(rowHtml(html, "연면적"))
          .match(/^([\d,.]+)\s*(?:m²|㎡)/)?.[1]
          ?.replaceAll(",", ""),
      ),
      scale: plain(rowHtml(html, "건축규모")),
      approval: plain(rowHtml(html, "사용승인")),
      heating_cooling: plain(rowHtml(html, "냉난방")),
      other_facilities: plain(rowHtml(html, "기타시설")),
      elevators: plain(rowHtml(html, "승강기")),
      parking: plain(rowHtml(html, "주차공간")),
      fetched_at: new Date().toISOString(),
      content_hash: createHash("sha256").update(html).digest("hex"),
    };
    await writeFile(
      sourceFile(item),
      JSON.stringify({ source, html }, null, 2),
    );
    console.log(JSON.stringify(source));
  }
} else {
  const db = await connectDatabase();
  try {
    const ids = dcubeIdentities.map((item) => item.id),
      before = {};
    for (const table of [
      "buildings",
      "building_asset_profiles",
      "building_images",
      "leasing_quarters",
      "development_records",
      "building_parcels",
    ])
      before[table] = (
        await db.query(
          `select * from ${table} where ${table === "buildings" ? "id" : "building_id"}=any($1::uuid[]) order by id`,
          [ids],
        )
      ).rows;
    before.complex = (
      await db.query("select * from building_complexes where id=$1", [
        complexId,
      ])
    ).rows;
    before.towers = (
      await db.query(
        "select * from building_towers where complex_id=$1 order by id",
        [complexId],
      )
    ).rows;
    before.master_assets = (
      await db.query(
        "select * from private.master_assets where existing_building_id=any($1::uuid[]) order by id",
        [ids],
      )
    ).rows;
    before.igis_publications = (
      await db.query(
        "select * from private.igis_catalog_publications where building_id=any($1::uuid[]) order by building_id",
        [ids],
      )
    ).rows;
    if (process.argv.includes("--inspect")) {
      console.log(
        "coLocated",
        JSON.stringify(
          (
            await db.query(
              "select id,name,address,road_address,status,gross_area_m2 from buildings where name ~ '신도림|디큐브|타임워크웨스트' or (coalesce(road_address,'') ~ '경인로\\s*662') or (coalesce(standard_address,address) ~ '신도림동\\s*692') order by name",
            )
          ).rows,
        ),
      );
      const legacy = "c319bb99-b72f-5cda-9148-0a5280c2e93f";
      console.log(
        "legacy",
        JSON.stringify(
          (
            await db.query(
              "select b.id,b.name,b.published,b.status,b.complex_id,b.latitude,b.longitude,b.typical_floor_exclusive_pyeong,b.typical_floor_source_url,(select count(*) from building_images i where i.building_id=b.id) images,(select count(*) from leasing_quarters l where l.building_id=b.id) leases,(select count(*) from private.master_assets m where m.existing_building_id=b.id) master_links, exists(select 1 from private.igis_catalog_publications i where i.building_id=b.id) igis_published, (select asset_category from private.igis_catalog_publications i where i.building_id=b.id) asset_category from buildings b where b.id=$1",
              [legacy],
            )
          ).rows,
        ),
      );
      console.log(
        JSON.stringify({
          buildings: before.buildings.map((b) => ({
            id: b.id,
            name: b.name,
            status: b.status,
            complex_id: b.complex_id,
            floor: b.typical_floor_exclusive_pyeong,
            source: b.typical_floor_source_url,
          })),
          leaseCount: before.leasing_quarters.length,
          photoCount: before.building_images.length,
        }),
      );
    } else {
      const sources = await Promise.all(
        dcubeIdentities.map(async (item) => {
          const { source } = JSON.parse(
            await readFile(sourceFile(item), "utf8"),
          );
          assert(matchFloorIdentity(item, source).ok);
          assert.deepEqual(source.warnings, []);
          assert(
            Date.now() - Date.parse(source.fetched_at) < 7 * 86400000,
            "Refresh source before applying",
          );
          return source;
        }),
      );
      const [spaceSource, timeSource] = sources;
      assert.equal(spaceSource.exclusive_pyeong, 347.75);
      assert.equal(timeSource.exclusive_pyeong, 1392);
      assert.equal(timeSource.rentable_pyeong, 3484);
      assert(
        Number.isFinite(timeSource.gross_area_m2) &&
          timeSource.gross_area_m2 > 33057,
      );
      assert(/지하2층.*지상6층/.test(timeSource.scale));
      assert(/2027년4월.*예정/.test(timeSource.approval));
      assert(/840대/.test(timeSource.parking));
      const existing = before.buildings.find((b) => b.id === spaceK.id);
      assert(existing);
      const legacyTimewalk = before.buildings.find((b) => b.id === timewalk.id);
      assert(
        legacyTimewalk && /펨코.*17호|타임워크웨스트/.test(legacyTimewalk.name),
      );
      assert.equal(legacyTimewalk.complex_id, null);
      assert(!existing.complex_id || existing.complex_id === complexId);
      if (apply)
        await writeFile(
          `${root}/before-${Date.now()}.json`,
          JSON.stringify(before, null, 2),
        );
      await db.query("begin");
      try {
        await db.query(
          "select set_config('app.review_origin','dcube_identity_correction',true),set_config('app.review_reason',$1,true)",
          [
            "2026-10-30 사용자 확인: 디큐브시티 스페이스케이와 타임워크웨스트는 별도 자산. 각 원문 기준층·개발단계 구분, 기존 임대 이력과 사진 보존",
          ],
        );
        await db.query(
          "select id from buildings where id=any($1::uuid[]) for update",
          [ids],
        );
        await db.query(
          "update building_towers set building_id=null,published=false where complex_id=$1 and (building_id is not null or published)",
          [complexId],
        );
        await db.query(
          `update buildings set complex_id=null,complex_scope=null,typical_floor_rentable_pyeong=$2,typical_floor_exclusive_pyeong=$3,typical_floor_source_url=$4,typical_floor_source_period=$5,typical_floor_collected_at=$6,latitude=$7,longitude=$8 where id=$1`,
          [
            spaceK.id,
            spaceSource.rentable_pyeong,
            spaceSource.exclusive_pyeong,
            spaceSource.url,
            spaceSource.period,
            spaceSource.fetched_at,
            spaceSource.latitude,
            spaceSource.longitude,
          ],
        );
        await db.query(
          `update buildings set name=$2,standard_address='서울특별시 구로구 신도림동 692',road_address='서울특별시 구로구 경인로 662',region=$3,status='development',gross_area_m2=$4,area_basis='planned',latitude=$5,longitude=$6,floors_above=6,floors_below=2,parking_spaces=840,source_name='오피스파인드',source_url=$7,verified_on=current_date,source_as_of=$8,typical_floor_rentable_pyeong=$9,typical_floor_exclusive_pyeong=$10,typical_floor_source_url=$7,typical_floor_source_period=$8,typical_floor_collected_at=$11,completion_year=null,usage_approved_on=null,completion_source_url=null,completion_collected_at=null where id=$1`,
          [
            timewalk.id,
            timewalk.name,
            existing.region,
            timeSource.gross_area_m2,
            timeSource.latitude,
            timeSource.longitude,
            timeSource.url,
            timeSource.period,
            timeSource.rentable_pyeong,
            timeSource.exclusive_pyeong,
            timeSource.fetched_at,
          ],
        );
        for (const [i, item] of dcubeIdentities.entries()) {
          await db.query(
            "update building_asset_profiles set heating_cooling=coalesce(heating_cooling,$2),other_facilities=coalesce(other_facilities,$3) where id=$1",
            [
              item.id,
              sources[i].heating_cooling || null,
              sources[i].other_facilities || null,
            ],
          );
          await db.query(
            "insert into private.catalog_publications(record_type,record_id) values('buildings',$1) on conflict do nothing",
            [item.id],
          );
        }
        await db.query(
          `insert into development_records(id,building_id,year,quarter,progress,source_name,source_url,as_of) values('74b3bf2e-c088-5bae-a55f-48c868849102',$1,'2027','2Q','2027년 4월 준공 예정','오피스파인드',$2,current_date) on conflict(id) do nothing`,
          [timewalk.id, timeSource.url],
        );
        await db.query(
          "insert into private.catalog_publications(record_type,record_id) values('development_records','74b3bf2e-c088-5bae-a55f-48c868849102') on conflict do nothing",
        );
        // Retire the combined listing while retaining physical source evidence.
        await db.query(
          "update building_complexes set published=false where id=$1",
          [complexId],
        );
        await db.query(
          "delete from private.catalog_publications where (record_type='building_complexes' and record_id=$1) or (record_type='building_towers' and record_id in(select id from building_towers where complex_id=$1))",
          [complexId],
        );
        const after = (
          await db.query(
            "select id,name,status,complex_id,typical_floor_exclusive_pyeong from catalog_buildings where id=any($1::uuid[]) order by name",
            [ids],
          )
        ).rows;
        assert.equal(after.length, 2);
        assert(after.every((b) => b.complex_id === null));
        assert.equal(
          (
            await db.query(
              "select count(*)::int n from catalog_complexes where id=$1",
              [complexId],
            )
          ).rows[0].n,
          0,
        );
        assert.equal(
          Number(
            after.find((b) => b.id === spaceK.id)
              .typical_floor_exclusive_pyeong,
          ),
          347.75,
        );
        assert.equal(
          Number(
            after.find((b) => b.id === timewalk.id)
              .typical_floor_exclusive_pyeong,
          ),
          1392,
        );
        for (const table of ["leasing_quarters", "building_images"])
          assert.deepEqual(
            (
              await db.query(
                `select * from ${table} where building_id=any($1::uuid[]) order by id`,
                [ids],
              )
            ).rows,
            before[table],
            `Preserve ${table}`,
          );
        assert.deepEqual(
          (
            await db.query(
              "select * from private.master_assets where existing_building_id=any($1::uuid[]) order by id",
              [ids],
            )
          ).rows,
          before.master_assets,
        );
        assert.deepEqual(
          (
            await db.query(
              "select * from private.igis_catalog_publications where building_id=any($1::uuid[]) order by building_id",
              [ids],
            )
          ).rows,
          before.igis_publications,
        );
        assert.equal(
          (
            await db.query(
              "select count(*)::int n from building_register_links where building_id=$1",
              [timewalk.id],
            )
          ).rows[0].n,
          0,
        );
        assert.equal(
          (
            await db.query(
              "select usage_approved_on from detail_buildings where id=$1",
              [timewalk.id],
            )
          ).rows[0].usage_approved_on,
          null,
        );
        await db.query(apply ? "commit" : "rollback");
        if (apply) {
          const resultFile = "data/private/officefind/results.json";
          const results = JSON.parse(await readFile(resultFile, "utf8"));
          await writeFile(
            `${root}/previous-floor-cache-${Date.now()}.json`,
            JSON.stringify(
              ids.map((id) => results[id]),
              null,
              2,
            ),
          );
          for (const [i, item] of dcubeIdentities.entries()) {
            const source = sources[i];
            const { html } = JSON.parse(
              await readFile(sourceFile(item), "utf8"),
            );
            results[item.id] = {
              building_id: item.id,
              name: item.name,
              status: "matched",
              source_url: source.url,
              source_name: source.name,
              source_address: source.address,
              rentable_pyeong: source.rentable_pyeong,
              exclusive_pyeong: source.exclusive_pyeong,
              source_period: source.period,
              raw_floor: source.raw_floor,
              warnings: source.warnings,
              content_hash: source.content_hash,
              observed_at: source.fetched_at,
              match_reason: "reviewed-distinct-leasing-asset",
              attempts: [
                {
                  url: source.url,
                  name: source.name,
                  address: source.address,
                  reason: "reviewed-distinct-leasing-asset",
                },
              ],
            };
            await writeFile(
              `data/private/officefind/pages/${createHash("sha256").update(source.url).digest("hex")}.json`,
              JSON.stringify({
                url: source.url,
                text: html,
                fetched_at: source.fetched_at,
                hash: source.content_hash,
              }),
            );
          }
          await writeFile(resultFile, JSON.stringify(results, null, 2));
        }
        console.log(
          JSON.stringify({
            apply,
            assets: after,
            originalLeaseHistoryPreserved: true,
            originalPhotosPreserved: true,
            plannedCompletion: "2027-04",
          }),
        );
      } catch (error) {
        await db.query("rollback");
        throw error;
      }
    }
  } finally {
    await db.end();
  }
}
