// Field names follow the Ministry's BldRgstHubService contract; all areas are m².
export const text = (value) =>
  value == null || String(value).trim() === "" ? null : String(value).trim();
export function number(value) {
  const v = text(value);
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
export function date(value) {
  const v = text(value);
  if (!/^\d{8}$/.test(v ?? "") || v.startsWith("0000")) return null;
  const iso = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6)}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === iso
    ? iso
    : null;
}
export function sourcePk(row) {
  const value = row.mgmBldrgstPk;
  if (typeof value === "number" && !Number.isSafeInteger(value))
    throw new Error("Unsafe numeric register identity");
  const pk = text(value);
  if (!pk) throw new Error("Missing register identity");
  return pk;
}
const textFields = {
  building_name: "bldNm",
  dong_name: "dongNm",
  register_type: "regstrGbCdNm",
  register_kind: "regstrKindCdNm",
  lot_address: "platPlc",
  road_address: "newPlatPlc",
  main_annex_code: "mainAtchGbCd",
  main_annex_name: "mainAtchGbCdNm",
  main_use: "mainPurpsCdNm",
  other_use: "etcPurps",
  structure: "strctCdNm",
  other_structure: "etcStrct",
  roof: "roofCdNm",
  other_roof: "etcRoof",
  seismic_design: "rserthqkDsgnApplyYn",
  seismic_capacity: "rserthqkAblty",
  energy_grade: "engrGrade",
  green_grade: "gnBldGrade",
  intelligent_grade: "itgBldGrade",
};
const numberFields = {
  site_area_m2: "platArea",
  building_area_m2: "archArea",
  gross_area_m2: "totArea",
  far_area_m2: "vlRatEstmTotArea",
  coverage_ratio: "bcRat",
  floor_area_ratio: "vlRat",
  height_m: "heit",
  floors_above: "grndFlrCnt",
  floors_below: "ugrndFlrCnt",
  passenger_elevators: "rideUseElvtCnt",
  emergency_elevators: "emgenUseElvtCnt",
  parking_total: "totPkngCnt",
  parking_indoor_mechanical: "indrMechUtcnt",
  parking_outdoor_mechanical: "oudrMechUtcnt",
  parking_indoor_self: "indrAutoUtcnt",
  parking_outdoor_self: "oudrAutoUtcnt",
  main_buildings: "mainBldCnt",
  annex_buildings: "atchBldCnt",
  annex_area_m2: "atchBldArea",
  households: "hhldCnt",
  units: "hoCnt",
  energy_saving_ratio: "engrRat",
  energy_epi: "engrEpi",
  green_score: "gnBldCert",
  intelligent_score: "itgBldCert",
};
export function normalizeTitle(row, operation) {
  const out = {
    register_pk: sourcePk(row),
    record_kind: operation === "getBrRecapTitleInfo" ? "complex" : "building",
  };
  for (const [key, source] of Object.entries(textFields))
    out[key] = text(row[source]);
  for (const [key, source] of Object.entries(numberFields))
    out[key] = number(row[source]);
  for (const [key, source] of Object.entries({
    permit_date: "pmsDay",
    construction_start_date: "stcnsDay",
    approval_date: "useAprDay",
    source_created_date: "crtnDay",
  }))
    out[key] = date(row[source]);
  return out;
}
export function normalizeFloor(row) {
  return {
    register_pk: sourcePk(row),
    dong_name: text(row.dongNm),
    floor_category: text(row.flrGbCdNm),
    floor_code: text(row.flrGbCd),
    floor_number: number(row.flrNo),
    floor_name: text(row.flrNoNm),
    main_annex_name: text(row.mainAtchGbCdNm),
    structure: text(row.strctCdNm),
    main_use: text(row.mainPurpsCdNm),
    other_use: text(row.etcPurps),
    area_m2: number(row.area),
    area_excluded: text(row.areaExctYn),
    source_created_date: date(row.crtnDay),
  };
}
export function normalizeArea(row) {
  return {
    register_pk: sourcePk(row),
    dong_name: text(row.dongNm),
    unit_name: text(row.hoNm),
    floor_category: text(row.flrGbCdNm),
    floor_number: number(row.flrNo),
    area_category: text(row.exposPubuseGbCdNm),
    area_category_code: text(row.exposPubuseGbCd),
    main_annex_name: text(row.mainAtchGbCdNm),
    structure: text(row.strctCdNm),
    main_use: text(row.mainPurpsCdNm),
    other_use: text(row.etcPurps),
    area_m2: number(row.area),
    source_created_date: date(row.crtnDay),
  };
}
