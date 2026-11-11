import { useState, type ReactNode } from "react";
import {
  igisSampleFund as sample,
  igisSampleMetrics as metrics,
} from "../lib/igis-sample-fund";
import { useAreaUnit } from "./AreaUnit";
import "./IgisSampleFund.css";

const sections = ["펀드 개요", "투자·대출", "임대·운영", "평가·이력"] as const;
const number = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });
const amount = (value: number) => `${number.format(value)}억 원`;
const percent = (value: number) => `${number.format(value)}%`;

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="info-panel igis-sample-card">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Values({ rows }: { rows: ReadonlyArray<readonly [string, string]> }) {
  return (
    <dl className="igis-sample-values">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function IgisSampleFund() {
  const [section, setSection] = useState<(typeof sections)[number]>(
    sections[0],
  );
  const { formatArea } = useAreaUnit();
  const {
    asset,
    fund,
    investors,
    loans,
    leases,
    operations,
    cashEntries,
    valuations,
    history,
  } = sample;

  return (
    <div className="igis-sample">
      <section className="igis-sample-summary" aria-label="가상 펀드 요약">
        <div className="igis-sample-summary-meta">
          <span className="igis-sample-label">가상 샘플</span>
          <span>{sample.asOf} 기준</span>
        </div>
        <h3>{sample.name}</h3>
        <p>{sample.code} · 운용 중</p>
        <dl className="igis-sample-metrics">
          {(
            [
              ["자산 평가액", amount(asset.valuation)],
              ["순자산가치", amount(metrics.nav)],
              ["담보대출비율", percent(metrics.ltv)],
              ["임대율", percent(metrics.occupancy)],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <div className="igis-sample-nav" role="group" aria-label="가상 펀드 항목">
        {sections.map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={section === name}
            onClick={() => setSection(name)}
          >
            {name}
          </button>
        ))}
      </div>

      {section === "펀드 개요" && (
        <>
          <Card title="펀드 기본 정보">
            <Values
              rows={[
                ["유형", "일반사모 부동산투자신탁"],
                ["설정일", fund.establishedOn],
                ["만기일", fund.maturity],
                ["운용사", fund.manager],
                ["수탁기관", fund.trustee],
                ["사무관리사", fund.administrator],
                [
                  "약정 / 납입",
                  `${amount(fund.committedCapital)} / ${amount(fund.fundedCapital)}`,
                ],
                ["목표 IRR", percent(fund.targetIrr)],
                ["운용 보수율", `연 ${percent(fund.fee)}`],
                ["누적 배당", amount(fund.distributed)],
              ]}
            />
          </Card>
          <Card title="투자 자산">
            <Values
              rows={[
                ["자산명", asset.name],
                ["용도", "업무시설 · 근린생활시설"],
                ["규모", asset.floors],
                ["연면적", formatArea(asset.grossArea)],
                ["전용면적", formatArea(asset.exclusiveArea)],
                ["인수일", asset.acquiredOn],
                ["인수가", amount(asset.acquisitionPrice)],
              ]}
            />
          </Card>
        </>
      )}
      {section === "투자·대출" && (
        <>
          <Card title="수익자별 출자">
            <div className="igis-sample-entries">
              {investors.map((investor) => (
                <div key={investor.name}>
                  <h4>
                    {investor.name} · {investor.tranche}
                  </h4>
                  <Values
                    rows={[
                      ["약정액", amount(investor.committed)],
                      ["납입액", amount(investor.funded)],
                    ]}
                  />
                </div>
              ))}
            </div>
          </Card>
          <Card title="대출 현황">
            <Values rows={[["대출 잔액 합계", amount(metrics.debt)]]} />
            <div className="igis-sample-entries">
              {loans.map((loan) => (
                <div key={loan.name}>
                  <h4>{loan.name}</h4>
                  <Values
                    rows={[
                      ["대주", loan.lender],
                      ["약정액", amount(loan.committed)],
                      ["잔액", amount(loan.balance)],
                      ["금리", `연 ${percent(loan.rate)}`],
                      ["만기일", loan.maturity],
                      ["상환 방식", loan.repayment],
                    ]}
                  />
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
      {section === "임대·운영" && (
        <>
          <Card title="임대차 현황">
            <div className="igis-sample-entries">
              {leases.map((lease) => (
                <div key={lease.name}>
                  <h4>
                    {lease.name} · {lease.floors}
                  </h4>
                  <Values
                    rows={[
                      ["전용면적", formatArea(lease.area)],
                      ["월임대료", amount(lease.rent)],
                      ["월관리비", amount(lease.fee)],
                      ["보증금", amount(lease.deposit)],
                      ["계약 만기", lease.expiresOn],
                    ]}
                  />
                </div>
              ))}
            </div>
          </Card>
          <Card title="운영 실적·계획">
            <table className="igis-sample-table">
              <thead>
                <tr>
                  <th scope="col">기간</th>
                  <th scope="col">수입</th>
                  <th scope="col">비용</th>
                  <th scope="col">NOI</th>
                  <th scope="col">시설투자</th>
                </tr>
              </thead>
              <tbody>
                {operations.map((row) => (
                  <tr key={row.period}>
                    <th scope="row">{row.period}</th>
                    <td>{row.rent + row.otherRevenue}</td>
                    <td>{row.expenses}</td>
                    <td>{row.rent + row.otherRevenue - row.expenses}</td>
                    <td>{row.capex}</td>
                  </tr>
                ))}
              </tbody>
              <caption>단위 억 원</caption>
            </table>
          </Card>
          <Card title="최근 입출금">
            <ul className="igis-sample-events">
              {cashEntries.map((row) => (
                <li key={row.date}>
                  <strong>{row.description}</strong>
                  <span>{amount(row.amount)}</span>
                  <small>
                    {row.date} · {row.type}
                  </small>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
      {section === "평가·이력" && (
        <>
          <Card title="감정평가 및 순자산">
            <Values
              rows={[
                ["평가기관", "가상 감정평가기관 A"],
                ["자본환원율", percent(asset.capRate)],
                ["기타자산", amount(fund.otherAssets)],
                ["기타부채", amount(fund.otherLiabilities)],
                ["순자산가치", amount(metrics.nav)],
              ]}
            />
            <table className="igis-sample-table">
              <thead>
                <tr>
                  <th scope="col">기준일</th>
                  <th scope="col">평가액</th>
                  <th scope="col">평가 방법</th>
                </tr>
              </thead>
              <tbody>
                {valuations.map((row) => (
                  <tr key={row.date}>
                    <th scope="row">{row.date}</th>
                    <td>{number.format(row.value)}</td>
                    <td>{row.method}</td>
                  </tr>
                ))}
              </tbody>
              <caption>평가액 단위 억 원</caption>
            </table>
          </Card>
          <Card title="운용 변경 이력">
            <ul className="igis-sample-events">
              {history.map((row) => (
                <li key={row.date}>
                  <strong>{row.title}</strong>
                  <span>{row.date}</span>
                  <small>{row.description}</small>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
