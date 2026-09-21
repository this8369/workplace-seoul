import { normalizeBuildingName } from "../lib/building-name.mjs";
import { normalizeAddress } from "../db/address-normalization.mjs";
export const plain = (value) =>
  String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/\s+/g, " ")
    .trim();
export const norm = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, "");
export const roadKey = (value) =>
  norm(normalizeAddress(String(value || "").split(/[（(]/)[0]));
export function aliases(building) {
  building = { ...building, name: normalizeBuildingName(building.name) };
  const base = building.name.split(/[<(（]/)[0].trim();
  const parts = [
    base,
    ...[
      ...building.name.matchAll(/[（(](?:구[,.,\s]*)?([^）)]*)[）)]/g),
    ].flatMap((x) => x[1].split(/[\/，,]/)),
  ];
  return [
    ...new Set(
      parts
        .flatMap((n) => [n, n.replace(/^[A-Za-z0-9 &'.-]+\s+(?=[가-힣])/, "")])
        .map((n) => n.replace(/^구(?:[, .]|\s)+/, "").trim())
        .filter((n) => norm(n).length >= 3),
    ),
  ];
}
const row = (html, label) =>
  html.match(
    new RegExp(
      `<th[^>]*>\\s*${label}\\s*</th>\\s*<td[^>]*>([\\s\\S]*?)</td>`,
      "i",
    ),
  )?.[1] || "";
export function parseOffice(html, url) {
  const name = plain(
    html.match(
      /<h1[^>]*class=["'][^"']*office-name[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i,
    )?.[1],
  );
  const address = plain(
    html.match(
      /<div[^>]*class=["'][^"']*office-address[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    )?.[1],
  );
  const floorHtml = row(html, "기준층\\s*면적");
  const warnings = [];
  const amount = (label) => {
    const span = floorHtml.match(
      new RegExp(`${label}\\s*<span([^>]*)>([\\s\\S]*?)</span>`),
    );
    if (!span) return null;
    const raw = span[1].match(/data-py=["']([\d,.]+)["']/)?.[1];
    const py = raw == null ? null : Number(raw.replaceAll(",", ""));
    if (py == null || !Number.isFinite(py) || py <= 0) return null;
    const visible = plain(span[2]);
    const m2 = Number(
      visible.match(/^([\d,.]+)\s*(?:m²|㎡)/)?.[1]?.replaceAll(",", ""),
    );
    // data-m2 in this source's floor row can be incorrectly scaled. Verify the
    // explicit data-py against the visible square metres; never use data-m2 here.
    if (
      Number.isFinite(m2) &&
      Math.abs(py - (m2 * 121) / 400) > Math.max(0.2, py * 0.005)
    ) {
      warnings.push(`${label}:unit-conflict`);
      return null;
    }
    return py;
  };
  let rentable = amount("임대"),
    exclusive = amount("전용");
  if (rentable != null && exclusive != null && exclusive > rentable) {
    warnings.push("exclusive-exceeds-rentable");
    rentable = exclusive = null;
  }
  const period = plain(
    html.match(/<h3[^>]*>기준층 임대시세([\s\S]*?)<\/h3>/)?.[1],
  );
  const coordinates = html.match(/data-map=["']([\d.]+),([\d.]+),/);
  return {
    name,
    address,
    url,
    rentable_pyeong: rentable,
    exclusive_pyeong: exclusive,
    period,
    raw_floor: plain(floorHtml),
    warnings,
    latitude: coordinates ? +coordinates[1] : null,
    longitude: coordinates ? +coordinates[2] : null,
  };
}
export function identityMatch(building, source, siblings = []) {
  building = { ...building, name: normalizeBuildingName(building.name) };
  if (!source.name || !source.address)
    return { ok: false, reason: "missing-identity" };
  const addressMatches = Boolean(
    building.road_address &&
    roadKey(building.road_address) === roadKey(source.address),
  );
  const sourceLot = source.address.match(/[（(]([^）)]+)[）)]/)?.[1];
  const lot = building.standard_address || building.address || "";
  const lotMatches =
    sourceLot &&
    norm(lot).endsWith(norm(sourceLot)) &&
    lot.match(/\S+구/)?.[0] === source.address.match(/\S+구/)?.[0];
  if (!addressMatches && !lotMatches)
    return { ok: false, reason: "address-mismatch" };
  if (
    building.latitude &&
    source.latitude &&
    Math.hypot(
      (building.latitude - source.latitude) * 111000,
      (building.longitude - source.longitude) * 88000,
    ) > 250
  )
    return { ok: false, reason: "coordinate-mismatch" };
  // Distinct tower records at one address cannot share a generic site page.
  const multiple = siblings.filter(
    (b) =>
      b.id !== building.id &&
      roadKey(b.road_address) &&
      roadKey(b.road_address) === roadKey(building.road_address),
  );
  const combined = building.name.match(
    /([A-Z][0-9]?)\s*[,·/]\s*([A-Z][0-9]?)(?:동|[ )]|$)/i,
  );
  if (
    combined &&
    ![combined[1], combined[2]].every((part) =>
      new RegExp(part + "(?![a-z0-9])", "i").test(source.name),
    )
  )
    return { ok: false, reason: "tower-ambiguous" };
  const scope =
    building.name.match(/<([^>]+)>/)?.[1] ||
    building.name.match(/(?:타워\s*[1-9]|[1-9]\s*동|[A-Z]동)/i)?.[0];
  // A component tower page cannot silently fill a whole-complex record.
  const sourceTower = source.name.match(
    /(?:타워\s*[1-9]|[1-9]\s*동|[A-Z]동)/i,
  )?.[0];
  if (sourceTower && !scope && !combined)
    return { ok: false, reason: "tower-ambiguous" };
  if (multiple.length || scope) {
    const sourceName = norm(source.name),
      targetName = norm(building.name);
    const exact = sourceName === targetName;
    if (!exact && (!scope || !sourceName.includes(norm(scope))))
      return { ok: false, reason: "tower-ambiguous" };
  }
  const nameMatches = aliases(building).some((a) => {
    const n = norm(a),
      s = norm(source.name);
    return (
      n === s ||
      (Math.min(n.length, s.length) >= 4 && (n.includes(s) || s.includes(n)))
    );
  });
  // A renamed asset is accepted by exact address only when there is one asset
  // at that address and no explicit tower distinction.
  return {
    ok: true,
    reason: nameMatches ? "name-and-address" : "unique-address-renamed",
  };
}

export function parseApproval(
  html,
  today = new Date().toISOString().slice(0, 10),
) {
  const raw = plain(row(html, "사용승인"));
  // A source can put future completion plans in its approval row.
  if (/예정|계획/.test(raw))
    return { raw, date: null, year: null, reason: "planned-date" };
  const match = /^(\d{4})-(\d{2})-(\d{2})(?=\s|\/|$)/.exec(raw);
  if (!match)
    return { raw, date: null, year: null, reason: "missing-or-invalid-date" };
  const date = match[0];
  const year = Number(match[1]);
  const parsed = new Date(date + "T00:00:00Z");
  if (
    year < 1800 ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  )
    return { raw, date: null, year: null, reason: "invalid-date" };
  if (date > today)
    return { raw, date: null, year: null, reason: "future-date" };
  return { raw, date, year, reason: "usage-approval" };
}
