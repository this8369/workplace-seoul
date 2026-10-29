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

export function marketLeaseEfficiency(
  lease: Leasing,
  buildingId: string,
  profileEfficiency: number | null,
): number | null {
  // Historical/source-floor rates keep their own denominator. A representative
  // complex profile is not a substitute for a different tower's observation.
  const value =
    lease.efficiency_pct ??
    (lease.building_id === buildingId ? profileEfficiency : null);
  return value != null && Number.isFinite(value) && value > 0 && value <= 100
    ? value
    : null;
}

const nonnegative = (value: number | null | undefined) =>
  value != null && Number.isFinite(value) && value >= 0 ? value : null;

export function estimateMarketRent(
  lease: Leasing,
  exclusivePyeong: number | null,
  efficiencyPct: number | null,
  basis: RentRateBasis,
) {
  const area = nonnegative(exclusivePyeong);
  const efficiency =
    efficiencyPct != null &&
    Number.isFinite(efficiencyPct) &&
    efficiencyPct > 0 &&
    efficiencyPct <= 100
      ? efficiencyPct / 100
      : null;
  const validUnits =
    (!lease.currency_code || lease.currency_code === "KRW") &&
    (!lease.rate_area_unit || lease.rate_area_unit === "pyeong");
  const billablePyeong =
    area == null || !validUnits
      ? null
      : basis === "exclusive"
        ? area
        : basis === "rentable" && efficiency != null
          ? area / efficiency
          : null;
  const total = (rate: number | null) => {
    const value = nonnegative(rate);
    const result =
      value != null && billablePyeong != null ? value * billablePyeong : null;
    return result != null && Number.isFinite(result) ? result : null;
  };
  const monthlyRent = total(lease.rent);
  const monthlyFee = total(lease.fee);
  const deposit = total(lease.deposit);
  // Monthly cash outlay excludes the refundable deposit and rent-free incentives.
  // Source NOC is a separate market observation, not a substitute for a missing rate.
  const fixedCost =
    monthlyRent != null && monthlyFee != null ? monthlyRent + monthlyFee : null;
  const monthlyFixedCost =
    fixedCost != null && Number.isFinite(fixedCost) ? fixedCost : null;
  const perArea =
    monthlyFixedCost != null && area != null && area > 0
      ? monthlyFixedCost / area
      : null;
  return {
    monthlyRent,
    monthlyFee,
    deposit,
    monthlyFixedCost,
    monthlyCostPerExclusive:
      perArea != null && Number.isFinite(perArea) ? perArea : null,
  };
}
