// Keep source text separately. Only deterministic spelling/structural repairs.
export function normalizeAddress(value, splitLot = false) {
  if (/^[.\s-]*$/.test(String(value || ""))) return "";
  let address = String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^영등포구 /, "서울특별시 영등포구 ")
    .replace(/^서울(?:시)? /, "서울특별시 ")
    .replace(/^경기 /, "경기도 ")
    .replace(/^(?:성남|성남시) /, "경기도 성남시 ")
    .replace(/^경기도 성남 /, "경기도 성남시 ")
    .replace(/^경기도 분당구 /, "경기도 성남시 분당구 ");
  // Only transaction source has separate main/sub lot columns, confirmed in its header.
  if (splitLot)
    address = address.replace(
      / (\d+) (\d+)$/,
      (_, main, sub) =>
        ` ${Number(main)}${Number(sub) ? "-" + Number(sub) : ""}`,
    );
  return address;
}
export const addressField = (a, type) =>
  a.addressElements.find((e) => e.types.includes(type))?.longName || "";
export function canonicalJibun(a) {
  return ["SIDO", "SIGUGUN", "DONGMYUN", "RI", "LAND_NUMBER"]
    .map((t) => addressField(a, t))
    .filter(Boolean)
    .join(" ");
}
export function canonicalRoad(a) {
  if (!addressField(a, "ROAD_NAME") || !addressField(a, "BUILDING_NUMBER"))
    return "";
  return ["SIDO", "SIGUGUN", "ROAD_NAME", "BUILDING_NUMBER"]
    .map((t) => addressField(a, t))
    .filter(Boolean)
    .join(" ");
}
export function exactAddressMatch(query, addresses) {
  const matches = addresses.filter(
    (a) =>
      normalizeAddress(canonicalJibun(a)) === normalizeAddress(query) &&
      Number(a.y) >= 33 &&
      Number(a.y) <= 39 &&
      Number(a.x) >= 124 &&
      Number(a.x) <= 132,
  );
  return new Set(matches.map((a) => `${a.x},${a.y}`)).size === 1
    ? matches[0]
    : null;
}
