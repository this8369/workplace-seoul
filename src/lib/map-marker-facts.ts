import type { Building } from "./domain.ts";
import { formatArea } from "./domain.ts";
import type { Leasing } from "./catalog.ts";

const quarter = (period: string) => {
  const match = /^(\d{4})[.\s-]*([1-4])Q$/i.exec(period);
  return match ? Number(match[1]) * 4 + Number(match[2]) : 0;
};
export type MarkerNoc = { value: number | null; period: string; basis: string };
/** Match the region summary: one shared latest quarter, no stale backfill. */
export function markerNocIndex(leasing: Leasing[]) {
  const latest = Math.max(0, ...leasing.map((l) => quarter(l.period)));
  const rows = new Map<string, Leasing[]>();
  for (const lease of leasing) {
    if (!latest || quarter(lease.period) !== latest) continue;
    rows.set(lease.building_id, [
      ...(rows.get(lease.building_id) || []),
      lease,
    ]);
  }
  const result = new Map<string, MarkerNoc>();
  for (const [id, observations] of rows) {
    const row = observations[0];
    const signatures = new Set(
      observations.map((l) =>
        JSON.stringify([l.noc, l.area_basis, l.vat_basis]),
      ),
    );
    result.set(id, {
      value:
        signatures.size === 1 &&
        row.noc != null &&
        Number.isFinite(row.noc) &&
        row.noc > 0
          ? row.noc
          : null,
      period: row.period,
      basis: [row.area_basis, row.vat_basis].filter(Boolean).join(" · "),
    });
  }
  return result;
}
export function mapMarkerFacts(building: Building, noc?: MarkerNoc) {
  const floor = building.typical_floor_area_pyeong;
  return [
    {
      label: building.area_basis === "planned" ? "계획 연면적" : "연면적",
      value: formatArea(building.gross_area_m2),
    },
    {
      label: "NOC",
      value:
        noc?.value != null
          ? `${(noc.value / 10000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}만원/평`
          : "미확인",
      note: noc?.period,
      title: noc ? `${noc.period} · ${noc.basis}` : "NOC 자료 미확인",
    },
    {
      label: "기준층 면적",
      value:
        floor != null && Number.isFinite(floor) && floor > 0
          ? `${floor.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}평`
          : "미확인",
    },
    {
      label: "준공년도",
      value: building.completion_year
        ? `${building.completion_year}년`
        : "미확인",
    },
  ];
}
