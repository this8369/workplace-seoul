import { Fragment } from "react";
import type { Leasing } from "../lib/catalog";
import { numeric } from "../lib/catalog";
import { latestMarketLease, rentRateBasis } from "../lib/market-leasing";
import { useAreaUnit } from "./AreaUnit";
import { ReviewValue as RV } from "./DataReview";
import "./MarketLeasing.css";

const rates = [
  ["rent", "월임대료"],
  ["fee", "관리비"],
  ["deposit", "보증금"],
  ["noc", "NOC"],
] as const;
const tableRates = [rates[2], rates[0], rates[1], rates[3]];

export default function MarketLeasing({ leases }: { leases: Leasing[] }) {
  const { unit, perPyeong } = useAreaUnit();
  const latest = latestMarketLease(leases);
  const bases = new Set(leases.map(rentRateBasis));
  const rateUnit = (lease?: Leasing, noc = false) => {
    const basis = lease
      ? rentRateBasis(lease)
      : bases.size === 1
        ? [...bases][0]
        : "unconfirmed";
    return `${noc || basis === "exclusive" ? "전용" : basis === "rentable" ? "임대" : ""}${unit}`;
  };
  const secondary = (lease: Leasing) => (
    <>
      <span>
        공실률{" "}
        <b>
          {numeric(lease.vacancy == null ? null : lease.vacancy * 100, "%")}
        </b>
      </span>
      <span>
        렌트프리{" "}
        <b>
          <RV entity="leasing_quarters" id={lease.id} field="rent_free">
            {numeric(lease.rent_free)}
          </RV>
        </b>
        {lease.rent_free != null && "개월/년"}
      </span>
    </>
  );
  return (
    <div className="market-leasing">
      {latest && (
        <section className="market-latest" aria-label="최신 임대시세">
          <div className="market-latest-heading">
            <h3>최신 임대시세</h3>
            <span>{latest.period}</span>
          </div>
          <dl className="market-latest-rates">
            {rates.map(([field, label]) => {
              const value = perPyeong(latest[field]);
              return (
                <div key={field}>
                  <dt>{label}</dt>
                  <dd>
                    <RV entity="leasing_quarters" id={latest.id} field={field}>
                      {value == null
                        ? "—"
                        : (value / 10_000).toLocaleString("ko-KR", {
                            maximumFractionDigits: 1,
                          })}
                    </RV>
                    {value != null && (
                      <small>만원/{rateUnit(latest, field === "noc")}</small>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      )}
      <div className="market-lease-table-wrap">
        <table className="market-lease-table" aria-label="분기별 시장 임대시세">
          <colgroup>
            <col className="market-lease-period" />
            {tableRates.map(([field]) => (
              <col className="market-lease-rate" key={field} />
            ))}
            <col className="market-lease-secondary" />
            <col className="market-lease-secondary" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">분기</th>
              {tableRates.map(([field, label]) => (
                <th scope="col" key={field}>
                  {label}
                  <small>원/{rateUnit(undefined, field === "noc")}</small>
                </th>
              ))}
              <th scope="col" className="market-lease-secondary">
                공실률
              </th>
              <th scope="col" className="market-lease-secondary">
                렌트프리<small>개월/년</small>
              </th>
            </tr>
          </thead>
          <tbody>
            {leases.map((lease) => (
              <Fragment key={lease.id}>
                <tr className="market-lease-values">
                  <th scope="row">
                    <RV entity="leasing_quarters" id={lease.id} field="period">
                      {lease.period}
                    </RV>
                  </th>
                  {tableRates.map(([field]) => (
                    <td key={field}>
                      <RV entity="leasing_quarters" id={lease.id} field={field}>
                        {numeric(perPyeong(lease[field]))}
                      </RV>
                    </td>
                  ))}
                  <td className="market-lease-secondary">
                    {numeric(
                      lease.vacancy == null ? null : lease.vacancy * 100,
                      "%",
                    )}
                  </td>
                  <td className="market-lease-secondary">
                    <RV
                      entity="leasing_quarters"
                      id={lease.id}
                      field="rent_free"
                    >
                      {numeric(lease.rent_free)}
                    </RV>
                  </td>
                </tr>
                <tr className="market-lease-mobile-details">
                  <td colSpan={5}>
                    <div>{secondary(lease)}</div>
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
