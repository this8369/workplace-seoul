// Add source-identified photos; candidates are visually checked before import.
import { readFile, writeFile, mkdir } from "node:fs/promises";
const root = "data/private/images";
await mkdir(`${root}/pages`, { recursive: true });
const buildings = JSON.parse(await readFile(`${root}/buildings.json`, "utf8"));
const records = JSON.parse(
  await readFile(`${root}/additional.json`, "utf8").catch(() => "{}"),
);
const pages = [
  ["센트로폴리스", "https://smatch.kr/insight/posts/cbd-centropolis", "smatch"],
  ["그랑서울", "https://drawingoffice.co.kr/building/2074"],
  ["센터필드", "https://www.centerfield.co.kr/about", "official"],
  ["파크원 <타워1>", "https://www.drawingoffice.co.kr/building/384"],
  ["센터원", "https://drawingoffice.co.kr/building/339"],
  ["아크플레이스", "https://drawingoffice.co.kr/building/399"],
  ["아크로서울포레스트", "https://drawingoffice.co.kr/building/1664"],
  ["아모레퍼시픽", "https://drawingoffice.co.kr/building/248"],
  ["을지트윈타워", "https://drawingoffice.co.kr/insights/434"],
];
pages.push(
  ...[
    ["광화문 D타워", 170],
    ["포스코센터", 626],
    ["더케이트윈타워", 292],
    ["오토웨이타워", 198],
    ["대신파이낸스센터", 114],
    ["디큐브시티", 239],
    ["광화문 교보생명", 368],
    ["게이트웨이타워", 337],
    ["GT TOWER", 171],
    ["TP Tower", 386],
    ["세미콜론문래", 379],
  ].map(([name, id]) => [name, `https://drawingoffice.co.kr/building/${id}`]),
);
pages.push(
  ...[
    ["한화손해보험빌딩", 403],
    ["상록회관", 1716],
    ["동아일보사 충정로사옥", 372],
    ["섬유센터빌딩", 547],
    ["트레이드타워", 498],
    ["아셈타워", 631],
    ["LG마포빌딩", 908],
    ["도심공항타워", 620],
  ].map(([name, id]) => [name, `https://drawingoffice.co.kr/building/${id}`]),
);
pages.push(["센트로폴리스", "https://drawingoffice.co.kr/building/205"]);
for (const [name, url, kind] of pages) {
  try {
    if (Object.values(records).some((r) => r.source_url === url)) continue;
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw Error(res.status);
    const html = await res.text();
    const b = buildings.find((b) => b.name.startsWith(name));
    if (!b) throw Error("unknown building");
    await writeFile(`${root}/pages/${b.id}.html`, html);
    const tags = [...html.matchAll(/<img[^>]*>/g)].map((m) => m[0]);
    let imageUrl;
    if (kind === "official")
      imageUrl = tags
        .find((t) => t.includes("/g1.jpg"))
        ?.match(/src="([^"]+)"/)?.[1];
    else if (kind === "smatch") {
      const raw = tags
        .find((t) => t.includes('alt="센트로폴리스 외관"'))
        ?.match(/src="([^"]+)"/)?.[1];
      imageUrl = new URL(
        raw.replaceAll("&amp;", "&"),
        "https://smatch.kr",
      ).searchParams.get("url");
    } else
      imageUrl = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
    if (!imageUrl || !imageUrl.startsWith("https://"))
      throw Error("missing image");
    // Match road address from the page, with official known complex address fallback.
    const address = b.road_address?.replace(/^서울특별시 /, "서울 ");
    const clean = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const road = b.road_address?.split(" ").slice(2).join(" ");
    if (kind !== "official" && !clean.includes(road) && !html.includes(road))
      throw Error(`address not found: ${road}`);
    const photo = await fetch(imageUrl, { signal: AbortSignal.timeout(20000) });
    if (!photo.ok) throw Error(photo.status);
    if (!photo.headers.get("content-type")?.startsWith("image/"))
      throw Error("not image");
    const bytes = Buffer.from(await photo.arrayBuffer());
    const file = `${root}/${b.id}.additional.source`;
    await writeFile(file, bytes);
    records[b.id] = {
      building_id: b.id,
      name: b.name,
      title: `${name} 외관`,
      source_name:
        kind === "official"
          ? "센터필드 공식 홈페이지"
          : kind === "smatch"
            ? "스매치 인사이트"
            : "드로잉",
      source_url: url,
      source_image_url: imageUrl,
      source_date: new Date().toISOString().slice(0, 10),
      source_address: address,
      image_file: file,
      source_bytes: bytes.length,
      status: "matched",
      review_note: `건물명·주소 확인: ${b.name} / ${b.road_address}. 복합건물은 전체 외관. 촬영일 미확인.`,
    };
    console.log(`Downloaded: ${b.name}`);
  } catch (e) {
    console.log(`${name}: ${e.message}`);
  }
}
await writeFile(`${root}/additional.json`, JSON.stringify(records, null, 2));

const centerHtml = await readFile(`${root}/pages/centerfield.html`, "utf8");
for (const match of centerHtml.matchAll(/src="(https:[^"]+\/g[2-8]\.jpg)"/g)) {
  const url = match[1];
  const res = await fetch(url);
  if (res.ok)
    await writeFile(
      `${root}/centerfield-${url.split("/").pop()}`,
      Buffer.from(await res.arrayBuffer()),
    );
}
