import { supabase } from "./supabase";
export type RegisterRecord = {
  id: string;
  register_pk: string;
  record_kind: "complex" | "building";
  building_name: string | null;
  dong_name: string | null;
  collected_at: string;
  source_created_date: string | null;
  [field: string]: string | number | boolean | null;
};
export type RegisterFloor = {
  id: string;
  record_id: string;
  dong_name: string | null;
  floor_category: string | null;
  floor_number: number | null;
  floor_name: string | null;
  main_use: string | null;
  other_use: string | null;
  area_m2: number | null;
  area_excluded: string | null;
  structure: string | null;
  source_ordinal: number;
};
export type RegisterArea = {
  id: string;
  record_id: string;
  dong_name: string | null;
  unit_name: string | null;
  floor_category: string | null;
  floor_number: number | null;
  area_category: string | null;
  area_m2: number | null;
  main_use: string | null;
};
export type RegisterSection = {
  id: string;
  record_id: string;
  section: "zoning" | "sanitation";
  attributes: Record<string, string | number | null>;
};
export type RegisterData = {
  records: RegisterRecord[];
  floors: RegisterFloor[];
  areas: RegisterArea[];
  sections: RegisterSection[];
};
export async function fetchBuildingRegister(
  buildingId: string,
): Promise<RegisterData> {
  if (!supabase) throw new Error("not-configured");
  const { data: links, error } = await supabase
    .from("building_register_links")
    .select("record_id")
    .eq("building_id", buildingId)
    .eq("status", "verified");
  if (error) throw error;
  const ids = [...new Set((links ?? []).map((l) => l.record_id as string))];
  if (!ids.length) return { records: [], floors: [], areas: [], sections: [] };
  async function all(table: string, column: string) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += 500) {
      let query = supabase!
        .from(table)
        .select("*")
        .in(column, ids)
        .order("id")
        .range(from, from + 499);
      if (table === "building_register_records")
        query = query.eq("is_current", true);
      const { data, error } = await query;
      if (error) throw error;
      rows.push(...data);
      if (data.length < 500) return rows;
    }
  }
  const [records, floors, areas, sections] = await Promise.all([
    all("building_register_records", "id"),
    all("building_register_floors", "record_id"),
    all("building_register_area_parts", "record_id"),
    all("building_register_sections", "record_id"),
  ]);
  return { records, floors, areas, sections } as RegisterData;
}
export type RegisterField = [key: string, label: string, unit?: string];
export const registerGroups: { title: string; fields: RegisterField[] }[] = [
  {
    title: "대장 및 주소",
    fields: [
      ["building_name", "대장상 건물명"],
      ["dong_name", "동 명칭"],
      ["register_type", "대장 구분"],
      ["register_kind", "대장 종류"],
      ["lot_address", "지번주소"],
      ["road_address", "도로명주소"],
      ["main_annex_name", "주·부속 구분"],
    ],
  },
  {
    title: "면적 및 건축밀도",
    fields: [
      ["site_area_m2", "대지면적", "㎡"],
      ["building_area_m2", "건축면적", "㎡"],
      ["gross_area_m2", "대장 연면적", "㎡"],
      ["far_area_m2", "용적률 산정 연면적", "㎡"],
      ["coverage_ratio", "건폐율", "%"],
      ["floor_area_ratio", "용적률", "%"],
    ],
  },
  {
    title: "용도 및 건축규모",
    fields: [
      ["main_use", "주용도"],
      ["other_use", "기타 용도"],
      ["structure", "구조"],
      ["roof", "지붕"],
      ["height_m", "높이", "m"],
      ["floors_above", "지상층수", "층"],
      ["floors_below", "지하층수", "층"],
      ["main_buildings", "주건축물", "동"],
      ["annex_buildings", "부속건축물", "동"],
      ["annex_area_m2", "부속건축물 면적", "㎡"],
    ],
  },
  {
    title: "주차 및 승강기",
    fields: [
      ["parking_total", "총괄대장 총주차", "대"],
      ["parking_indoor_self", "옥내 자주식", "대"],
      ["parking_outdoor_self", "옥외 자주식", "대"],
      ["parking_indoor_mechanical", "옥내 기계식", "대"],
      ["parking_outdoor_mechanical", "옥외 기계식", "대"],
      ["passenger_elevators", "승용 승강기", "대"],
      ["emergency_elevators", "비상용 승강기", "대"],
    ],
  },
  {
    title: "인허가 및 사용승인",
    fields: [
      ["permit_date", "건축허가일"],
      ["construction_start_date", "착공일"],
      ["approval_date", "사용승인일"],
    ],
  },
  {
    title: "인증 및 내진설계",
    fields: [
      ["energy_grade", "에너지효율등급"],
      ["energy_saving_ratio", "에너지절감율", "%"],
      ["energy_epi", "EPI 점수"],
      ["green_grade", "친환경건축물등급"],
      ["green_score", "친환경 인증점수"],
      ["intelligent_grade", "지능형건축물등급"],
      ["intelligent_score", "지능형 인증점수"],
      ["seismic_design", "내진설계 적용"],
      ["seismic_capacity", "내진능력"],
    ],
  },
];
export function registerValue(value: unknown, unit = "") {
  if (value == null || value === "") return "미기재";
  return typeof value === "number"
    ? `${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}${unit}`
    : String(value);
}
