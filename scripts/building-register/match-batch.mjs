import { readFile, writeFile } from "node:fs/promises";
const read = async (p) => JSON.parse(await readFile(p, "utf8"));
const plan = await read("data/private/building-register-batch.json");
const fold = (s) =>
  String(s ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, "");
const linked = [],
  unmatched = [];
for (const parcel of plan.parcels) {
  const key = ["sigunguCd", "bjdongCd", "platGbCd", "bun", "ji"]
    .map((k) => parcel[k])
    .join("-");
  let records = [];
  for (const operation of ["getBrTitleInfo", "getBrRecapTitleInfo"]) {
    try {
      const rows = (
        await read(`data/private/building-register/${key}-${operation}.json`)
      ).items;
      records.push(
        ...rows.map((r) => ({
          ...r,
          kind: operation === "getBrTitleInfo" ? "building" : "complex",
        })),
      );
    } catch {}
  }
  for (const b of parcel.assets) {
    const area = Number(b.gross_area_m2);
    let candidates = records.filter(
      (r) =>
        Number(r.totArea) > 0 &&
        Math.abs(Number(r.totArea) - area) / area < 0.003 &&
        String(r.mainAtchGbCd ?? "0") !== "1",
    );
    const sameYear = (r) =>
      b.completion_year &&
      String(r.useAprDay ?? "").slice(0, 4) === String(b.completion_year);
    const nameMatch = (r) =>
      [r.bldNm, r.dongNm].some(
        (n) => fold(n).length >= 4 && fold(b.name).includes(fold(n)),
      );
    if (candidates.length > 1 && candidates.some(sameYear))
      candidates = candidates.filter(sameYear);
    if (candidates.length > 1 && candidates.some(nameMatch))
      candidates = candidates.filter(nameMatch);
    // A recap and a title with identical scope are not two independent buildings.
    if (
      candidates.length === 2 &&
      candidates.some((r) => r.kind === "complex") &&
      candidates.some((r) => r.kind === "building") &&
      Math.abs(Number(candidates[0].totArea) - Number(candidates[1].totArea)) <
        1
    )
      candidates = candidates.filter((r) => r.kind === "building");
    const r = candidates[0];
    if (
      candidates.length === 1 &&
      (nameMatch(r) || sameYear(r) || Math.abs(Number(r.totArea) - area) < 1)
    ) {
      linked.push({
        building_id: b.id,
        expected_building_name: b.name,
        register_pk: String(r.mgmBldrgstPk),
        record_kind: r.kind,
        parcel_key: key,
        expected_register_name: String(r.bldNm ?? "").trim() || null,
        evidence: `공식 법정동 코드와 자산 지번 일치(${b.standard_address || b.address}). 원장 연면적 ${area}㎡ / 대장 ${r.totArea}㎡, 해당 지번의 유일한 일치 후보. ${sameYear(r) ? "사용승인 연도 일치. " : ""}${nameMatch(r) ? "건물명/동명 일치. " : ""}총괄·동별 면적을 합산하지 않음.`,
      });
    } else
      unmatched.push({
        id: b.id,
        name: b.name,
        area,
        year: b.completion_year,
        parcel_key: key,
        candidates: records.map((r) => ({
          pk: String(r.mgmBldrgstPk),
          name: r.bldNm,
          dong: r.dongNm,
          area: r.totArea,
          approval: r.useAprDay,
          kind: r.kind,
        })),
      });
  }
}
// Never auto-attach the same register to separate catalog assets.
const counts = new Map();
for (const l of linked) {
  const k = l.register_pk + "-" + l.record_kind;
  counts.set(k, (counts.get(k) || 0) + 1);
}
const links = linked.filter(
  (l) => counts.get(l.register_pk + "-" + l.record_kind) === 1,
);
for (const l of linked.filter((l) => !links.includes(l)))
  unmatched.push({
    ...l,
    reason: "대장 하나에 자산 여러 개가 중복 대응되어 검토 필요",
  });
const keys = new Set(links.map((l) => l.parcel_key));
const output = {
  ...plan,
  parcels: plan.parcels.filter((p) =>
    keys.has(
      ["sigunguCd", "bjdongCd", "platGbCd", "bun", "ji"]
        .map((k) => p[k])
        .join("-"),
    ),
  ),
  operations: undefined,
  links,
};
await writeFile(
  "data/private/building-register-linked.json",
  JSON.stringify(output, null, 2),
  { mode: 0o600 },
);
await writeFile(
  "data/private/building-register-unmatched.json",
  JSON.stringify(unmatched, null, 2),
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    links: links.length,
    parcels: output.parcels.length,
    review: unmatched.length,
  }),
);
