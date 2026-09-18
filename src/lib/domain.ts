export type Building = {
  id: string;
  name: string;
  address: string;
  region: string;
  status: "operating" | "development";
  gross_area_m2: number;
  area_basis: "actual" | "planned";
  latitude: number | null;
  longitude: number | null;
  overview: string | null;
  floors_above: number | null;
  floors_below: number | null;
  completion_year: number | null;
  parking_spaces: number | null;
  source_name: string;
  source_url: string | null;
  verified_on: string | null;
  source_as_of?: string;
};
export const toPyeong = (m2: number) => (m2 * 121) / 400;
// Never compare rounded display values.
export const isEligible = (m2: number) =>
  Number.isFinite(m2) && m2 * 121 >= 4_000_000;
export const formatArea = (m2: number) =>
  `${toPyeong(m2).toLocaleString("ko-KR", { maximumFractionDigits: 0 })}평`;
export function filterBuildings(
  buildings: Building[],
  query: string,
  region: string,
  status: string,
  saved?: Set<string>,
) {
  const q = query.trim().toLocaleLowerCase("ko-KR");
  return buildings.filter(
    (b) =>
      isEligible(b.gross_area_m2) &&
      (!q || `${b.name} ${b.address}`.toLocaleLowerCase("ko-KR").includes(q)) &&
      (!region || b.region === region) &&
      (!status || b.status === status) &&
      (!saved || saved.has(b.id)),
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
