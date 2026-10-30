import type { Leasing } from "./catalog.ts";

export type RentRateBasis = "rentable" | "exclusive" | "unconfirmed";

function quarter(period: string) {
  const match = /^(\d{4})[.\s-]*([1-4])Q$/i.exec(period.trim());
  return match ? Number(match[1]) * 4 + Number(match[2]) : 0;
}

// Keep a partial latest observation; never fill its missing rates from an older quarter.
export function latestMarketLease(rows: readonly Leasing[]): Leasing | null {
  const market = rows.filter(
    (row) => !row.data_domain || row.data_domain === "market_leasing",
  );
  const latest = Math.max(0, ...market.map((row) => quarter(row.period)));
  if (!latest) return null;
  const current = market.filter((row) => quarter(row.period) === latest);
  const signatures = new Set(
    current.map((row) =>
      JSON.stringify([
        row.building_id,
        row.deposit,
        row.rent,
        row.fee,
        row.noc,
        row.area_basis,
        row.vat_basis,
        row.currency_code,
        row.rate_area_unit,
        row.efficiency_pct,
        row.efficiency_source_period,
        row.efficiency_source_scope,
      ]),
    ),
  );
  return signatures.size === 1 ? current[0] : null;
}

export function rentRateBasis(lease: Leasing): RentRateBasis {
  if (/미확인|unknown|unconfirmed/i.test(lease.area_basis))
    return "unconfirmed";
  if (/전용|exclusive/i.test(lease.area_basis)) return "exclusive";
  if (/임대|계약|rentable/i.test(lease.area_basis)) return "rentable";
  return "unconfirmed";
}
