import type { Building } from "./domain.ts";
import type { Leasing } from "./catalog.ts";

function quarter(period: string) {
  const match = /^(\d{4})[.\s-]*([1-4])Q$/i.exec(period);
  return match ? Number(match[1]) * 4 + Number(match[2]) : 0;
}

// One shared quarter across regions; never fill missing current NOC with older data.
// Conflicting duplicate observations are excluded rather than counted twice.
export function regionStats(
  buildings: Building[],
  leasing: Leasing[],
  region: string,
) {
  const assets = [
    ...new Map(
      buildings.filter((b) => b.region === region).map((b) => [b.id, b]),
    ).values(),
  ];
  const ids = new Set(assets.map((b) => b.id));
  const latest = Math.max(0, ...leasing.map((l) => quarter(l.period)));
  const period =
    leasing.find((l) => latest > 0 && quarter(l.period) === latest)?.period ??
    null;
  const observations = new Map<string, Leasing[]>();
  for (const lease of leasing) {
    if (
      !latest ||
      !ids.has(lease.building_id) ||
      quarter(lease.period) !== latest
    )
      continue;
    observations.set(lease.building_id, [
      ...(observations.get(lease.building_id) ?? []),
      lease,
    ]);
  }
  const values: number[] = [];
  for (const rows of observations.values()) {
    const signatures = new Set(
      rows.map((l) => JSON.stringify([l.noc, l.area_basis, l.vat_basis])),
    );
    const noc = rows[0].noc;
    if (
      signatures.size === 1 &&
      noc !== null &&
      Number.isFinite(noc) &&
      noc > 0
    )
      values.push(noc);
  }
  return {
    count: assets.length,
    area: assets.reduce(
      (sum, b) =>
        sum + (Number.isFinite(b.gross_area_m2) ? b.gross_area_m2 : 0),
      0,
    ),
    planned: assets.some((b) => b.area_basis === "planned"),
    period,
    samples: values.length,
    average: values.length
      ? values.reduce((sum, n) => sum + n, 0) / values.length
      : null,
    highest: values.length ? Math.max(...values) : null,
    lowest: values.length ? Math.min(...values) : null,
  };
}
