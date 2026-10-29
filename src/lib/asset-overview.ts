import type { Place } from "./asset-context";
import type { RegisterRecord } from "./building-register";
import { stationLines, stationName } from "./subway-stations.ts";
export const overviewLabels: Record<string, string> = {
  owner_name: "소유주",
  site_area_m2: "대지면적(㎡)",
  floor_area_ratio: "용적률(%)",
  efficiency_pct: "전용률(%)",
  ceiling_height_m: "천정고(m)",
  lease_span_m: "Lease Span(m)",
  office_area_m2: "오피스면적(㎡)",
  retail_area_m2: "리테일면적(㎡)",
  office_area_basis: "오피스면적 기준",
  retail_area_basis: "리테일면적 기준",
  contractor_name: "시공사",
  architect_name: "설계사",
  views: "VIEW",
  green_spaces: "자연환경",
  hotels: "호텔",
  amenity_operators: "어메니티 운영사",
  retail_operators: "브랜드 리테일 운영사",
  subway_connections: "지하철 직연결",
  certifications: "친환경 인증",
  contracted_capacity_mw: "자산계약수전량(MW)",
  dual_substation: "이중변전소",
};
export const tagCategories: Record<string, string> = {
  views: "view",
  green_spaces: "green_space",
  hotels: "hotel",
  amenity_operators: "operator",
  retail_operators: "operator",
};
export type Connection = {
  station_name: string;
  lines: string[];
  direct_connection: boolean | null;
};
export function prepareSubwayConnections(value: unknown): Connection[] {
  if (!Array.isArray(value)) throw Error("연결역 정보를 확인해 주세요.");
  const connections: Connection[] = [];
  value.forEach((row, index) => {
    const station =
      typeof row?.station_name === "string" ? row.station_name.trim() : "";
    const lines = Array.isArray(row?.lines)
      ? [
          ...new Set<string>(
            row.lines
              .map((line: unknown) =>
                typeof line === "string" ? line.trim() : "",
              )
              .filter(Boolean),
          ),
        ]
      : [];
    const direct = row?.direct_connection ?? null;
    // Adding a new form row must not make an otherwise complete edit fail.
    if (!station && !lines.length && direct == null) return;
    if (!station) throw Error(`연결역 ${index + 1}의 역 이름을 입력해 주세요.`);
    if (
      station.length > 100 ||
      lines.length > 10 ||
      lines.some((line) => line.length > 40) ||
      (direct != null && typeof direct !== "boolean")
    )
      throw Error(`연결역 ${index + 1}의 입력값을 확인해 주세요.`);
    connections.push({
      station_name: station,
      lines,
      direct_connection: direct,
    });
  });
  if (connections.length > 30)
    throw Error("연결역은 최대 30개까지 등록할 수 있습니다.");
  return connections;
}
export type Certification = {
  option_code: string;
  status: string;
  certified_on?: string;
  expires_on?: string;
  certificate_url?: string;
  logo_url?: string;
};
export type CertificationOption = {
  code: string;
  scheme: string;
  grade: string;
  logo_url: string | null;
  official_url: string;
  sort_order: number;
};
export type AssetProfile = {
  id: string;
  owner_name: string | null;
  site_area_m2: number | null;
  floor_area_ratio: number | null;
  efficiency_pct: number | null;
  ceiling_height_m: number | null;
  lease_span_m: number | null;
  office_area_m2: number | null;
  retail_area_m2: number | null;
  office_area_basis: string;
  retail_area_basis: string;
  contractor_name: string | null;
  architect_name: string | null;
  views: string[];
  green_spaces: string[];
  hotels: string[];
  amenity_operators: string[];
  retail_operators: string[];
  subway_connections: Connection[];
  certifications: Certification[];
};
export type PowerSpec = {
  id: string;
  contracted_capacity_mw: number | null;
  dual_substation: boolean | null;
};
// Prefer a single verified total register; never add total + individual buildings.
// Multiple unrelated records do not establish an asset-wide value.
export function overviewRegisterFact(records: RegisterRecord[], field: string) {
  const complexes = records.filter((r) => r.record_kind === "complex");
  const buildings = records.filter((r) => r.record_kind === "building");
  const candidates =
    complexes.length === 1
      ? [complexes[0], ...(buildings.length === 1 ? buildings : [])]
      : complexes.length === 0 && buildings.length === 1
        ? buildings
        : [];
  for (const r of candidates) {
    let value = r[field];
    if (field === "parking_total" && value == null) {
      const parts = [
        "parking_indoor_self",
        "parking_outdoor_self",
        "parking_indoor_mechanical",
        "parking_outdoor_mechanical",
      ].map((k) => r[k]);
      if (parts.every((x) => typeof x === "number" && x >= 0))
        value = (parts as number[]).reduce((a, b) => a + b, 0);
    }
    if (value == null || value === "" || typeof value === "boolean") continue;
    if (
      typeof value === "number" &&
      (!Number.isFinite(value) ||
        value < 0 ||
        (value === 0 && !["floors_below", "parking_total"].includes(field)))
    )
      continue;
    return { record: r, value };
  }
  return null;
}
export const certificateStates: Record<string, string> = {
  certified: "취득",
  precertified: "예비인증",
  planned: "취득 예정",
  expired: "만료",
  unknown: "상태 미확인",
};
export const areaBases: Record<string, string> = {
  unknown: "면적 기준 미확인",
  gross: "연면적 기준",
  exclusive: "전용면적 기준",
  rentable: "임대면적 기준",
};
export const subwayLines = [
  "1호선",
  "2호선",
  "3호선",
  "4호선",
  "5호선",
  "6호선",
  "7호선",
  "8호선",
  "9호선",
  "공항철도",
  "경의중앙선",
  "수인분당선",
  "신분당선",
  "경춘선",
  "경강선",
  "서해선",
  "GTX-A",
  "인천1호선",
  "인천2호선",
  "우이신설선",
  "신림선",
  "김포골드라인",
  "의정부경전철",
  "용인에버라인",
];
export const lineColors: Record<string, string> = {
  "1호선": "#0052a4",
  "2호선": "#00883c",
  "3호선": "#df6b00",
  "4호선": "#0087bd",
  "5호선": "#8149b1",
  "6호선": "#ad5b20",
  "7호선": "#68731a",
  "8호선": "#d42c76",
  "9호선": "#87754b",
  공항철도: "#427b92",
  경의중앙선: "#41846e",
  수인분당선: "#927800",
  신분당선: "#c42c36",
  경춘선: "#167d71",
  경강선: "#255db1",
  서해선: "#568c27",
  "GTX-A": "#834061",
  인천1호선: "#6e98bb",
  인천2호선: "#ed8b00",
  우이신설선: "#8b9c18",
  신림선: "#6789ca",
  김포골드라인: "#9b842f",
  의정부경전철: "#c87900",
  용인에버라인: "#509f22",
};
export function loadDensity(
  mw: number | null | undefined,
  grossM2: number | null | undefined,
) {
  if (
    mw == null ||
    grossM2 == null ||
    !Number.isFinite(mw) ||
    !Number.isFinite(grossM2) ||
    mw < 0 ||
    grossM2 <= 0
  )
    return null;
  return (mw * 1_000_000) / ((grossM2 * 121) / 400);
}
export function certificateState(
  c: Certification,
  today = new Date().toISOString().slice(0, 10),
) {
  return c.expires_on && c.expires_on < today && c.status === "certified"
    ? "expired"
    : c.status;
}
export function nearbyStations(places: Place[]) {
  const result: (Place & { lines: string[] })[] = [];
  places
    .filter(
      (p) =>
        p.category === "transit" &&
        p.distance_m != null &&
        Number(p.distance_m) <= 500 &&
        /역/.test(p.name) &&
        !/버스|정류장|출구|주차/.test(p.name),
    )
    .sort((a, b) => Number(a.distance_m) - Number(b.distance_m))
    .forEach((p) => {
      const explicit: string[] = [];
      let text = p.name;
      // Consume longer labels first: Incheon Line 1 must not become Seoul Line 1.
      for (const line of [...subwayLines].sort((a, b) => b.length - a.length)) {
        if (text.includes(line)) {
          explicit.push(line);
          text = text.replaceAll(line, "");
        }
      }
      const name = stationName(text);
      if (!name) return;
      const lines = [...new Set([...explicit, ...stationLines(name, p)])];
      const existing = result.find((s) => s.name === `${name}역`);
      if (existing)
        existing.lines = [...new Set([...existing.lines, ...lines])];
      else result.push({ ...p, name: `${name}역`, lines });
    });
  return result;
}
const certificationGrades: Record<string, string[]> = {
  leed: ["Certified", "Silver", "Gold", "Platinum"],
  well: ["Bronze", "Silver", "Gold", "Platinum"],
  breeam: ["Pass", "Good", "Very Good", "Excellent", "Outstanding"],
  "g-seed": ["일반", "우량", "우수", "최우수"],
  zeb: ["5등급", "4등급", "3등급", "2등급", "1등급", "ZEB+"],
  "energy star": ["Certified"],
};
function certificationLabel(code: string) {
  if (code === "well_unspecified") return "WELL · 등급 미기재";
  const parts = code.split("_"),
    scheme = parts[0],
    grade = certificationGrades[scheme]?.[Number(parts[1]) - 1];
  return grade ? `${scheme.toUpperCase()} ${grade}` : code;
}
export function overviewValueText(field: string, value: unknown) {
  if (Array.isArray(value)) {
    if (field === "subway_connections")
      return (
        (value as Connection[])
          .map(
            (x) =>
              `${x.lines.join("·")} ${x.station_name} (${x.direct_connection == null ? "직연결 미확인" : x.direct_connection ? "직연결" : "직연결 없음"})`,
          )
          .join(", ") || "미등록"
      );
    if (field === "certifications")
      return (
        (value as Certification[])
          .map(
            (x) =>
              `${certificationLabel(x.option_code)} · ${certificateStates[x.status] || x.status}`,
          )
          .join(", ") || "미등록"
      );
    return value.join(" · ") || "미등록";
  }
  if (field === "dual_substation")
    return value == null ? "미확인" : value ? "O" : "X";
  return value == null || value === "" ? "미확인" : String(value);
}
