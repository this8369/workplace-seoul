import { useId, useState, type CSSProperties } from "react";
import type { Leasing } from "../lib/catalog";
import { convertArea } from "../lib/area-unit";
import {
  estimateMarketRent,
  marketLeaseEfficiency,
  rentRateBasis,
  marketNocPerExclusive,
} from "../lib/market-rent-calculator";
import { useAreaUnit } from "./AreaUnit";
import "./MarketRentCalculator.css";

const amount = (value: number | null) =>
  value == null
    ? "—"
    : (value / 10_000).toLocaleString("ko-KR", { maximumFractionDigits: 1 });

export default function MarketRentCalculator({
  lease,
  buildingId,
  typicalExclusivePyeong,
  efficiencyPct,
}: {
  lease: Leasing;
  buildingId: string;
  typicalExclusivePyeong?: number | null;
  efficiencyPct: number | null;
}) {
  const { unit } = useAreaUnit();
  const id = useId();
  const floor =
    typicalExclusivePyeong != null &&
    Number.isFinite(typicalExclusivePyeong) &&
    typicalExclusivePyeong > 0
      ? typicalExclusivePyeong
      : null;
  const [area, setArea] = useState<number | null>(floor ?? 100);
  const basis = rentRateBasis(lease);
  const efficiency = marketLeaseEfficiency(lease, buildingId, efficiencyPct);
  const maximum = Math.max(floor ?? 1000, area ?? 0);
  const shownArea =
    area == null ? "" : Number(convertArea(area, "평", unit).toFixed(1));
  const estimate = estimateMarketRent(lease, area, efficiency, basis);
  const sourceNoc = marketNocPerExclusive(lease);
  const noc = sourceNoc == null ? null : sourceNoc / convertArea(1, "평", unit);
  const vat = /미확인|unknown|unconfirmed/i.test(lease.vat_basis)
    ? ""
    : /별도|exclusive|excluded/i.test(lease.vat_basis)
      ? "VAT 별도"
      : /포함|inclusive|included/i.test(lease.vat_basis)
        ? "VAT 포함"
        : "";
  function changeArea(value: number) {
    setArea(
      Number.isFinite(value) && value >= 0
        ? convertArea(value, unit, "평")
        : null,
    );
  }
  const metrics = [
    ["월임대료", estimate.monthlyRent, "만원"],
    ["월관리비", estimate.monthlyFee, "만원"],
    ["보증금", estimate.deposit, "만원"],
    ["시장 NOC", noc, `만원/${unit}`],
  ] as const;
  return (
    <section className="market-rent-calculator" aria-label="예상 임대비용">
      <div className="rent-calculator-heading">
        <h3>예상 임대비용</h3>
        <span>
          {lease.period}
          {vat && ` · ${vat}`}
        </span>
      </div>
      <div className="rent-calculator-inputs">
        <label className="rent-calculator-area" htmlFor={`${id}-area`}>
          <span>전용면적</span>
          <span>
            <input
              id={`${id}-area`}
              type="number"
              min="0"
              step="0.1"
              inputMode="decimal"
              aria-label="전용면적"
              aria-describedby={`${id}-unit`}
              value={shownArea}
              onChange={(event) => changeArea(event.target.valueAsNumber)}
            />
            <span id={`${id}-unit`}>{unit}</span>
          </span>
        </label>
      </div>
      <input
        className="rent-calculator-slider"
        type="range"
        min="0"
        max={maximum}
        step="0.1"
        value={area ?? 0}
        aria-label="전용면적 조절"
        aria-valuemin={0}
        aria-valuemax={convertArea(maximum, "평", unit)}
        aria-valuenow={area == null ? 0 : convertArea(area, "평", unit)}
        aria-valuetext={`${shownArea || 0}${unit}`}
        style={
          {
            "--range-progress": `${((area ?? 0) / maximum) * 100}%`,
          } as CSSProperties
        }
        onChange={(event) => setArea(event.target.valueAsNumber)}
      />
      <div className="rent-calculator-range-labels" aria-hidden="true">
        <span>0</span>
        <span>
          {convertArea(maximum, "평", unit).toLocaleString("ko-KR", {
            maximumFractionDigits: 1,
          })}
          {unit}
        </span>
      </div>
      <dl className="rent-calculator-results">
        {metrics.map(([label, value, suffix]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              <output aria-label={label}>{amount(value)}</output>
              {value != null && <small>{suffix}</small>}
            </dd>
          </div>
        ))}
        <div className="rent-calculator-total">
          <dt>월고정비용</dt>
          <dd>
            <output aria-label="월고정비용">
              {amount(estimate.monthlyFixedCost)}
            </output>
            {estimate.monthlyFixedCost != null && <small>만원</small>}
          </dd>
        </div>
      </dl>
    </section>
  );
}
