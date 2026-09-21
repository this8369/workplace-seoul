import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { normalizeBuildingName } from "../../scripts/lib/building-name.mjs";
import { identityMatch } from "../../scripts/officefind/parser.mjs";

const cases = [
  ["GRAND CENTRAL (구, SG타워) <저층부>", "GRAND CENTRAL (구, SG타워)"],
  ["부영태평빌딩 <중층부 9층~18층>", "부영태평빌딩"],
  ["서울스퀘어 <저층부 3층~5층>", "서울스퀘어"],
  ["센트로폴리스(Centropolis) <A동 저층>", "센트로폴리스(Centropolis) <A동>"],
  ["파크원 <타워1> <중층부1>", "파크원 <타워1>"],
  ["파크원 <타워2> <중층부>", "파크원 <타워2>"],
  ["타워 (B동 고층부)", "타워 (B동)"],
  ["타워 [초고층부 35층~45층]", "타워"],
  ["파인에비뉴 A,B동", "파인에비뉴 A,B동"],
  ["센터원 East Tower", "센터원 East Tower"],
  ["센터원 <East, West> <3층~13층>", "센터원 <East, West>"],
  ["삼성생명 서초타워 <2층~10층>", "삼성생명 서초타워"],
  ["광화문 D타워 (D1, D2)", "광화문 D타워 (D1, D2)"],
  ["기준층 / 지상 30층 / 지하 6층", "기준층 / 지상 30층 / 지하 6층"],
];

test("source import and crawler remove rental bands while retaining tower and building floor specifications", () => {
  for (const [input, expected] of cases)
    assert.equal(normalizeBuildingName(input), expected);
  const python = execFileSync(
    "python3",
    [
      "-c",
      `import runpy,json,sys
f=runpy.run_path('scripts/import/normalize-source.py')['asset_name']
print(json.dumps([f(v) for v in json.load(sys.stdin)]))`,
    ],
    { input: JSON.stringify(cases.map((c) => c[0])), encoding: "utf8" },
  );
  assert.deepEqual(
    JSON.parse(python),
    cases.map((c) => c[1]),
  );
  const b = {
    id: "1",
    name: "테스트빌딩 <저층부>",
    road_address: "서울 중구 세종대로 14",
  };
  const source = { name: "테스트빌딩", address: b.road_address };
  assert.equal(identityMatch(b, source).ok, true);
  assert.equal(
    identityMatch(b, { ...source, name: "테스트빌딩 A동" }).ok,
    false,
  );
  assert.equal(
    identityMatch(
      { ...b, name: "테스트빌딩 <A동 저층>" },
      { ...source, name: "테스트빌딩 B동" },
    ).ok,
    false,
  );
  assert.equal(
    identityMatch(
      { ...b, name: "테스트빌딩 <A동 저층>" },
      { ...source, name: "테스트빌딩 A동" },
    ).ok,
    true,
  );
});

test("migration cleans live labels and future writes without losing tower identity, NOC or references", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$select null::uuid$$;`);
    for (const name of [
      "202609180001_core.sql",
      "202609180003_asset_archive.sql",
      "202609210002_typical_floor_scope.sql",
    ])
      await db.exec(
        await readFile(
          new URL("../migrations/" + name, import.meta.url),
          "utf8",
        ),
      );
    await db.exec(
      "create table public.building_images(id uuid primary key default gen_random_uuid(),review_note text)",
    );
    for (const [input] of cases)
      await db.query(
        `insert into buildings(name,address,region,status,gross_area_m2,area_basis,source_name,verified_on) values($1,'Address','CBD','operating',40000,'actual','test','2026-09-21')`,
        [input],
      );
    const before = (
      await db.query(
        "select id,name,gross_area_m2 from buildings order by name",
      )
    ).rows;
    const tower = before.find((b) => b.name.includes("<A동"));
    await db.query(
      `insert into leasing_quarters(building_id,period,noc,area_basis,vat_basis,source_name) values($1,'2025.4Q',410000,'unknown','unknown','test')`,
      [tower.id],
    );
    await db.exec(
      await readFile(
        new URL(
          "../migrations/202609210003_remove_rental_strata.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        new URL(
          "../migrations/202609210004_remove_named_floor_ranges.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const after = (
      await db.query("select id,name,gross_area_m2 from buildings")
    ).rows;
    assert.equal(after.length, before.length);
    for (const b of before)
      assert.deepEqual(
        after.find((a) => a.id === b.id),
        { ...b, name: normalizeBuildingName(b.name) },
      );
    assert.equal(
      Number((await db.query("select noc from leasing_quarters")).rows[0].noc),
      410000,
    );
    for (const [input, expected] of cases) {
      await db.query("update buildings set name=$1 where id=$2", [
        input,
        tower.id,
      ]);
      assert.equal(
        (await db.query("select name from buildings where id=$1", [tower.id]))
          .rows[0].name,
        expected,
      );
    }
    await db.query(
      `insert into transactions(building_name,region,source_name) values('센트로폴리스 <B동 중층부>','CBD','test')`,
    );
    assert.equal(
      (await db.query("select building_name from transactions")).rows[0]
        .building_name,
      "센트로폴리스 <B동>",
    );
    await db.query(
      `insert into building_images(review_note) values('사진: 센트로폴리스 <A동 저층> / 외관')`,
    );
    assert.equal(
      (await db.query("select review_note from building_images")).rows[0]
        .review_note,
      "사진: 센트로폴리스 <A동> / 외관",
    );
  } finally {
    await db.close();
  }
});
