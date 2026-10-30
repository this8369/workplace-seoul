export type AssetCategory =
  | "office"
  | "hotel"
  | "logistics"
  | "data_center"
  | "retail"
  | "residential"
  | "mixed"
  | "other";
export const assetCategoryOptions = [
  { value: "", label: "전체" },
  { value: "office", label: "오피스" },
  { value: "hotel", label: "호텔" },
  { value: "logistics", label: "물류센터" },
  { value: "data_center", label: "데이터센터" },
  { value: "retail", label: "리테일" },
  { value: "residential", label: "주거" },
  { value: "mixed", label: "복합시설" },
  { value: "other", label: "기타" },
];
// Keep logistics records classified for a future sector without offering them
// in the current discovery experience.
export const discoveryAssetCategoryOptions = assetCategoryOptions.filter(
  (option) => option.value !== "logistics",
);
export type Building = {
  is_igis?: boolean;
  igis_source_building_id?: string | null;
  is_mixed_use?: boolean;
  asset_category?: AssetCategory;
  id: string;
  complex_id?: string | null;
  complex_scope?: "aggregate" | "component" | "related" | null;
  member_ids?: string[];
  member_names?: string[];
  name: string;
  address: string;
  source_address?: string;
  standard_address?: string | null;
  road_address?: string | null;
  region: string;
  status: "operating" | "development";
  gross_area_m2: number | null;
  area_basis: "actual" | "planned";
  latitude: number | null;
  longitude: number | null;
  overview: string | null;
  floors_above: number | null;
  floors_below: number | null;
  completion_year: number | null;
  usage_approved_on?: string | null;
  completion_source_url?: string | null;
  completion_collected_at?: string | null;
  typical_floor_area_pyeong?: number | null;
  component_source_building_id?: string | null;
  typical_floor_rentable_pyeong?: number | null;
  typical_floor_exclusive_pyeong?: number | null;
  typical_floor_scope?: string | null;
  typical_floor_source_url?: string | null;
  typical_floor_source_period?: string | null;
  typical_floor_collected_at?: string | null;
  parking_spaces: number | null;
  source_name: string;
  source_url: string | null;
  verified_on: string | null;
  source_as_of?: string;
};
export const toPyeong = (m2: number) => (m2 * 121) / 400;
// Never compare rounded display values.
export const isEligible = (m2: number | null) =>
  m2 != null && Number.isFinite(m2) && m2 * 121 >= 4_000_000;
export const formatArea = (m2: number | null) =>
  m2 == null || !Number.isFinite(m2)
    ? "미확인"
    : `${toPyeong(m2).toLocaleString("ko-KR", { maximumFractionDigits: 0 })}평`;
export function filterBuildings(
  buildings: Building[],
  query: string,
  region: string,
  status: string,
  saved?: Set<string>,
  igisMode = false,
  assetCategory = "",
) {
  const q = query.trim().toLocaleLowerCase("ko-KR");
  return buildings.filter(
    (b) =>
      b.asset_category !== "logistics" &&
      (!!saved || b.is_igis === true || isEligible(b.gross_area_m2)) &&
      (igisMode
        ? b.is_igis === true &&
          (!assetCategory ||
            b.asset_category === assetCategory ||
            (assetCategory === "mixed" && b.is_mixed_use === true))
        : (b.asset_category ?? "office") === "office") &&
      (!q ||
        `${b.name} ${(b.member_names || []).join(" ")} ${b.address} ${b.road_address || ""}`
          .toLocaleLowerCase("ko-KR")
          .includes(q)) &&
      (!region || b.region === region) &&
      (!status || b.status === status) &&
      (!saved || saved.has(b.id) || b.member_ids?.some((id) => saved.has(id))),
  );
}
export function safeSourceUrl(value: string | null): string | undefined {
  if (!value) return;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "http:") return url.href;
  } catch {
    /* Invalid source. */
  }
}
