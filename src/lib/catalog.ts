import type { BuildingImage } from "./building-images";
import type { Building } from "./domain.ts";
import { toPyeong } from "./domain.ts";
import type { BuildingComplex, BuildingTower } from "./building-towers.ts";
export type Evidence = {
  source_name: string;
  source_url: string | null;
  as_of: string | null;
};
export type Transaction = Evidence & {
  id: string;
  building_id: string | null;
  building_name: string;
  region: string;
  year: number | null;
  amount_won: number | null;
  building_area_m2: number | null;
  traded_area_m2: number | null;
  unit_price_won: number | null;
  seller: string;
  buyer: string;
  scope: string;
  kind: string;
  note: string;
  link_status: "candidate" | "verified" | "unlinked";
};
export type Company = {
  id: string;
  name: string;
  industry: string | null;
  overview: string | null;
};
export type Occupancy = Evidence & {
  id: string;
  building_id: string;
  company_id: string;
  floors: string | null;
  area_m2: number | null;
  started_on: string | null;
  ended_on: string | null;
  status: "confirmed" | "historical" | "unconfirmed";
};
export type Movement = Evidence & {
  id: string;
  company_name: string;
  period: string;
  kind: string;
  from_building_id: string | null;
  to_building_id: string | null;
  from_name: string;
  to_name: string;
  industry: string;
  link_status: "candidate" | "verified";
};
export type Leasing = Evidence & {
  id: string;
  building_id: string;
  period: string;
  deposit: number | null;
  rent: number | null;
  fee: number | null;
  noc: number | null;
  vacancy: number | null;
  rent_free: number | null;
  area_basis: string;
  vat_basis: string;
};
export type Development = Evidence & {
  id: string;
  building_id: string;
  year: string;
  quarter: string;
  permit: string;
  started: string;
  developer: string;
  contractor: string;
  progress: string;
};
export type Catalog = {
  complexes: BuildingComplex[];
  towers: BuildingTower[];
  buildings: Building[];
  transactions: Transaction[];
  companies: Company[];
  occupancies: Occupancy[];
  movements: Movement[];
  leasing: Leasing[];
  developments: Development[];
  images: BuildingImage[];
  review: boolean;
};
export const emptyCatalog: Catalog = {
  complexes: [],
  towers: [],
  buildings: [],
  transactions: [],
  companies: [],
  occupancies: [],
  movements: [],
  leasing: [],
  developments: [],
  images: [],
  review: false,
};
export const money = (won: number | null) =>
  won == null
    ? "미확인"
    : `${(won / 100000000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억`;
export const numeric = (value: number | null, suffix = "") =>
  value == null
    ? "미확인"
    : `${value.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}${suffix}`;
export const transactionArea = (m2: number | null) =>
  m2 == null ? "미확인" : numeric(toPyeong(m2), "평");
// Source-reported price is never recomputed against whole-building area.
export const unitPrice = (t: Transaction) =>
  t.unit_price_won == null
    ? "미확인"
    : `${(t.unit_price_won / 10000).toLocaleString("ko-KR", { maximumFractionDigits: 0 })}만원/평`;
export function filterTransactions(
  rows: Transaction[],
  query: string,
  region: string,
  year: string,
  scope: string,
  sort: string,
) {
  const q = query.trim().toLowerCase();
  return rows
    .filter(
      (t) =>
        (!q ||
          `${t.building_name} ${t.seller} ${t.buyer}`
            .toLowerCase()
            .includes(q)) &&
        (!region || t.region === region) &&
        (!year || String(t.year) === year) &&
        (!scope || t.scope === scope),
    )
    .sort((a, b) =>
      sort === "amount"
        ? (b.amount_won ?? -1) - (a.amount_won ?? -1)
        : (b.year ?? 0) - (a.year ?? 0) ||
          a.building_name.localeCompare(b.building_name, "ko"),
    );
}
export function occupancyGroups(rows: Occupancy[], buildingId: string) {
  const related = rows.filter((o) => o.building_id === buildingId);
  return {
    confirmed: related.filter((o) => o.status === "confirmed" && !o.ended_on),
    other: related.filter((o) => o.status !== "confirmed" || !!o.ended_on),
  };
}
