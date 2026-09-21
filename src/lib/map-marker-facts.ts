import type { Building } from "./domain.ts";
import { formatArea } from "./domain.ts";
import type { Leasing, Development } from "./catalog.ts";
import { towerFloorText, type BuildingTower } from "./building-towers.ts";

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
export type MarkerDevelopment = {
  developer: string;
  contractor: string;
  source: string;
  completion?: string;
};
export function markerDevelopmentIndex(developments: Development[]) {
  const grouped = new Map<string, Development[]>();
  for (const row of developments)
    grouped.set(row.building_id, [
      ...(grouped.get(row.building_id) || []),
      row,
    ]);
  return new Map(
    [...grouped].map(([id, rows]) => {
      const latest = rows
        .map((r) => r.as_of || "")
        .sort()
        .at(-1);
      const current = rows.filter((r) => (r.as_of || "") === latest);
      const unique = (key: "developer" | "contractor") => {
        const values = [...new Set(current.map((r) => r[key]?.trim() || ""))];
        return values.length === 1 ? values[0] : "";
      };
      return [
        id,
        {
          developer: unique("developer"),
          contractor: unique("contractor"),
          completion: (() => {
            const values = [
              ...new Set(
                current.map((r) => {
                  const year = r.year?.trim();
                  if (year === "미정") return "미정";
                  if (!year || !/^(18|19|20|21|22)\d{2}$/.test(year))
                    return "미확인";
                  return `${year}년`;
                }),
              ),
            ];
            return values.length === 1 ? values[0] : "미확인";
          })(),
          source: current
            .map((r) => [r.source_name, r.as_of].filter(Boolean).join(" · "))
            .join(" / "),
        },
      ];
    }),
  );
}
type MarkerFact = {
  label: string;
  value: string;
  note?: string;
  title?: string;
};
export function mapMarkerFacts(
  building: Building,
  noc?: MarkerNoc,
  development?: MarkerDevelopment,
  towers: BuildingTower[] = [],
): MarkerFact[] {
  const floor = (value: number | null | undefined) =>
    value != null && Number.isFinite(value) && value > 0
      ? `${value.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}평`
      : "미확인";
  const area = {
    label: building.area_basis === "planned" ? "계획 연면적" : "연면적",
    value: formatArea(building.gross_area_m2),
  };
  const rentable = {
    label: "기준층 임대면적",
    value: towers.length
      ? towerFloorText(towers, "rentable")
      : floor(building.typical_floor_rentable_pyeong),
    title:
      (towers.length
        ? towers.map(
            (t) => `${t.label} · ${t.source_period || "기준시점 미확인"}`,
          )
        : [building.typical_floor_source_period, building.typical_floor_scope]
      )
        .filter(Boolean)
        .join(" · ") || undefined,
  };
  const completion = {
    label: "준공년도",
    title: building.usage_approved_on
      ? `사용승인일 ${building.usage_approved_on}`
      : undefined,
    value: building.completion_year
      ? `${building.completion_year}년`
      : "미확인",
  };
  if (building.status === "development")
    return [
      area,
      {
        label: "소유주·시행주체",
        value: development?.developer || "미확인",
        title: development?.source,
      },
      rentable,
      {
        label: "시공사",
        value: development?.contractor || "미확인",
        title: development?.source,
      },
      {
        label: "준공 예정",
        value: development?.completion || "미확인",
        title: development?.source,
      },
    ];
  return [
    area,
    {
      label: "NOC",
      value:
        noc?.value != null
          ? `${(noc.value / 10000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}만원/평`
          : "미확인",
      note: noc?.period,
      title: noc ? `${noc.period} · ${noc.basis}` : "NOC 자료 미확인",
    },
    rentable,
    {
      label: "기준층 전용면적",
      value: towers.length
        ? towerFloorText(towers, "exclusive")
        : floor(building.typical_floor_exclusive_pyeong),
      title:
        (towers.length
          ? towers.map(
              (t) => `${t.label} · ${t.source_period || "기준시점 미확인"}`,
            )
          : [building.typical_floor_source_period, building.typical_floor_scope]
        )
          .filter(Boolean)
          .join(" · ") || undefined,
    },
    completion,
  ];
}
