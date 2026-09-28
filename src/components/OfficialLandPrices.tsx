import { useId, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Parcel } from "../lib/asset-context";

function axisAmount(value: number) {
  if (value >= 100000000) return `${Number((value / 100000000).toFixed(2))}억`;
  if (value >= 10000)
    return `${Number((value / 10000).toFixed(1)).toLocaleString("ko-KR")}만`;
  return Math.round(value).toLocaleString("ko-KR");
}

export default function OfficialLandPrices({
  prices,
}: {
  prices: Parcel["official_prices"];
}) {
  const [unit, setUnit] = useState<"㎡" | "평">("평");
  const [year, setYear] = useState<number | null>(null);
  const gradientId = useId();
  const rows = [...prices]
    .filter(
      (p) =>
        Number.isFinite(p.year) &&
        Number.isFinite(p.price_won_m2) &&
        p.price_won_m2 >= 0,
    )
    .sort((a, b) => a.year - b.year);
  const factor = unit === "평" ? 400 / 121 : 1;
  const selectedIndex = Math.max(
    0,
    year == null || !rows.some((p) => p.year === year)
      ? rows.length - 1
      : rows.findIndex((p) => p.year === year),
  );
  const selected = rows[selectedIndex];
  const amount = (value: number) =>
    Math.round(value * factor).toLocaleString("ko-KR");
  const left = 66,
    right = 502,
    top = 20,
    bottom = 238;
  const max = Math.max(1, ...rows.map((p) => p.price_won_m2 * factor));
  const step = 10 ** Math.floor(Math.log10(max)) / 2;
  const ceiling = Math.ceil((max * 1.08) / step) * step;
  const firstYear = rows[0]?.year ?? 0,
    lastYear = rows.at(-1)?.year ?? 0;
  const x = (y: number) =>
    firstYear === lastYear
      ? (left + right) / 2
      : left + ((y - firstYear) / (lastYear - firstYear)) * (right - left);
  const y = (value: number) =>
    bottom - ((value * factor) / ceiling) * (bottom - top);
  const line = rows
    .map((p, i) => `${i ? "L" : "M"}${x(p.year)},${y(p.price_won_m2)}`)
    .join(" ");
  const tickIndices = [
    ...new Set(
      Array.from({ length: Math.min(6, rows.length) }, (_, i) =>
        Math.round(
          (i * (rows.length - 1)) / Math.max(1, Math.min(6, rows.length) - 1),
        ),
      ),
    ),
  ];
  const move = (direction: number) =>
    setYear(
      rows[Math.min(rows.length - 1, Math.max(0, selectedIndex + direction))]
        .year,
    );
  return (
    <section className="info-panel official-prices">
      <div className="section-heading">
        <div>
          <h3>개별공시지가</h3>
          <p className="context-note">선택 필지의 연도별 가격 추이</p>
        </div>
        <div className="segmented" aria-label="공시지가 면적 단위">
          {(["평", "㎡"] as const).map((value) => (
            <button
              key={value}
              aria-pressed={unit === value}
              onClick={() => setUnit(value)}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      {selected ? (
        <div className="official-prices-layout">
          <div className="official-price-chart">
            <div className="official-price-summary">
              <div className="official-price-year">
                <button
                  aria-label="이전 공시 연도"
                  disabled={selectedIndex === 0}
                  onClick={() => move(-1)}
                >
                  <ChevronLeft size={18} />
                </button>
                <strong>
                  {selected.year}
                  <small>년</small>
                </strong>
                <button
                  aria-label="다음 공시 연도"
                  disabled={selectedIndex === rows.length - 1}
                  onClick={() => move(1)}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
              <div className="official-price-amount">
                <span>개별공시지가</span>
                <strong>
                  {amount(selected.price_won_m2)}
                  <small>원/{unit}</small>
                </strong>
              </div>
            </div>
            <svg
              viewBox="0 0 520 276"
              className="official-price-svg"
              role="img"
              aria-label={`${firstYear}년부터 ${lastYear}년까지 개별공시지가 추이. 선택 연도 ${selected.year}년, ${amount(selected.price_won_m2)}원/${unit}. 아래 표와 연도 이동 버튼으로도 확인할 수 있습니다.`}
              onPointerMove={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect();
                const px = ((event.clientX - bounds.left) / bounds.width) * 520;
                const nearest = rows.reduce((a, b) =>
                  Math.abs(x(a.year) - px) <= Math.abs(x(b.year) - px) ? a : b,
                );
                setYear(nearest.year);
              }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#5367c4" stopOpacity=".18" />
                  <stop offset="100%" stopColor="#5367c4" stopOpacity=".02" />
                </linearGradient>
              </defs>
              {Array.from({ length: 5 }, (_, i) => {
                const value = (ceiling * i) / 4,
                  py = bottom - ((bottom - top) * i) / 4;
                return (
                  <g key={i}>
                    <line
                      x1={left}
                      x2={right}
                      y1={py}
                      y2={py}
                      className="official-price-grid"
                    />
                    <text
                      x={left - 12}
                      y={py + 4}
                      textAnchor="end"
                      className="official-price-axis"
                    >
                      {axisAmount(value)}
                    </text>
                  </g>
                );
              })}
              {tickIndices.map((i) => (
                <g key={rows[i].year}>
                  <line
                    x1={x(rows[i].year)}
                    x2={x(rows[i].year)}
                    y1={top}
                    y2={bottom}
                    className="official-price-grid is-vertical"
                  />
                  <text
                    x={x(rows[i].year)}
                    y={bottom + 25}
                    textAnchor="middle"
                    className="official-price-axis"
                  >
                    {rows[i].year}
                  </text>
                </g>
              ))}
              {rows.length > 1 && (
                <path
                  d={`${line} L${x(lastYear)},${bottom} L${x(firstYear)},${bottom} Z`}
                  fill={`url(#${gradientId})`}
                />
              )}
              <path
                d={line}
                fill="none"
                stroke="#3348a0"
                strokeWidth="3"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <line
                x1={x(selected.year)}
                x2={x(selected.year)}
                y1={top}
                y2={bottom}
                stroke="#8992a6"
                strokeDasharray="4 4"
              />
              <circle
                cx={x(selected.year)}
                cy={y(selected.price_won_m2)}
                r="6"
                fill="white"
                stroke="#3348a0"
                strokeWidth="3"
              />
            </svg>
            <p className="official-price-chart-hint">
              그래프에 마우스를 올리거나 연도를 선택해 확인하세요.
            </p>
          </div>
          <div
            className="official-price-table-scroll"
            tabIndex={0}
            aria-label="연도별 공시지가 표"
          >
            <table className="official-price-table">
              <thead>
                <tr>
                  <th scope="col">기준년도</th>
                  <th scope="col">공시일자</th>
                  <th scope="col">
                    금액 <span>(원/{unit})</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...rows].reverse().map((p) => (
                  <tr
                    key={p.year}
                    className={p.year === selected.year ? "is-selected" : ""}
                  >
                    <th scope="row">
                      <button
                        onClick={() => setYear(p.year)}
                        aria-pressed={p.year === selected.year}
                      >
                        {p.year}년
                      </button>
                    </th>
                    <td>{p.as_of?.replaceAll("-", ".") || "—"}</td>
                    <td>{amount(p.price_won_m2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="context-note">연도별 공시지가 데이터 연결 전입니다.</p>
      )}
    </section>
  );
}
