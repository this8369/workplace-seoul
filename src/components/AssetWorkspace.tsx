import { markerDevelopmentIndex } from "../lib/map-marker-facts";
import { towersFor, towerFloorText } from "../lib/building-towers";
import BuildingPhoto from "./BuildingPhoto";
import { primaryImage } from "../lib/building-images";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Building2,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  MapPin,
  Search,
  Users,
  X,
} from "lucide-react";
import type { Building } from "../lib/domain";
import { formatArea, safeSourceUrl } from "../lib/domain";
import {
  filterTransactions,
  money,
  numeric,
  occupancyGroups,
  transactionArea,
  unitPrice,
  type Catalog,
  type Evidence,
  type Transaction,
} from "../lib/catalog";

function Source({ item }: { item: Evidence }) {
  const url = safeSourceUrl(item.source_url);
  return (
    <div className="evidence">
      {item.as_of && <span>자료 기준 {item.as_of} · </span>}
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">
          {item.source_name}
          <ArrowUpRight size={12} />
        </a>
      ) : (
        item.source_name
      )}
    </div>
  );
}
function Blank({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="section-empty">
      <FileText size={23} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function TransactionDialog({
  transaction: t,
  onClose,
  onBuilding,
}: {
  transaction: Transaction;
  onClose: () => void;
  onBuilding: (id: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="transaction-dialog" onClose={onClose}>
      <div className="dialog-heading">
        <span className="eyebrow">TRANSACTION RECORD</span>
        <button
          aria-label="거래 상세 닫기"
          onClick={() => ref.current?.close()}
        >
          <X size={20} />
        </button>
      </div>
      <p className="eyebrow">
        {t.year ?? "시점 미확인"} · {t.region}
      </p>
      <h2>{t.building_name}</h2>
      <div className="transaction-price">
        {money(t.amount_won)}
        <span>거래금액 · 원화</span>
      </div>
      <dl>
        <div>
          <dt>매입 범위</dt>
          <dd>{t.scope || "미확인"}</dd>
        </div>
        <div>
          <dt>거래 유형</dt>
          <dd>{t.kind || "미확인"}</dd>
        </div>
        <div>
          <dt>건물 전체 연면적</dt>
          <dd>{transactionArea(t.building_area_m2)}</dd>
        </div>
        <div>
          <dt>실제 거래면적</dt>
          <dd>{transactionArea(t.traded_area_m2)}</dd>
        </div>
        <div>
          <dt>원문 평당가</dt>
          <dd>{unitPrice(t)}</dd>
        </div>
        <div>
          <dt>매도인</dt>
          <dd>{t.seller || "미확인"}</dd>
        </div>
        <div>
          <dt>매수인</dt>
          <dd>{t.buyer || "미확인"}</dd>
        </div>
      </dl>
      <p className="context-note">
        평당가는 원문에 기재된 값입니다. 거래면적·지분·금액의 산정 범위를 확인한
        뒤 비교하세요.
      </p>
      {t.note && <p className="record-note">{t.note}</p>}
      <Source item={t} />
      {t.building_id ? (
        <button
          className="primary go-building"
          onClick={() => {
            onBuilding(t.building_id!);
            onClose();
          }}
        >
          {t.link_status === "candidate"
            ? "연결 후보 건물 보기"
            : "건물 상세 보기"}
          <ArrowUpRight size={15} />
        </button>
      ) : (
        <p className="context-note">연결된 건물 정보가 아직 없습니다.</p>
      )}
      {t.link_status === "candidate" && (
        <p className="context-note">
          명칭·권역 기준의 연결 후보입니다. 동일 자산인지 검수 전입니다.
        </p>
      )}
    </dialog>
  );
}
export function Transactions({
  catalog,
  query,
  region,
  onBuilding,
  buildingId,
}: {
  catalog: Catalog;
  query: string;
  region: string;
  onBuilding: (id: string) => void;
  buildingId?: string;
}) {
  const [year, setYear] = useState(""),
    [scope, setScope] = useState(""),
    [sort, setSort] = useState("recent"),
    [page, setPage] = useState(0),
    [detail, setDetail] = useState<Transaction | null>(null);
  const base = useMemo(
    () =>
      catalog.transactions.filter(
        (t) => !buildingId || t.building_id === buildingId,
      ),
    [catalog.transactions, buildingId],
  );
  const rows = useMemo(
    () => filterTransactions(base, query, region, year, scope, sort),
    [base, query, region, year, scope, sort],
  );
  useEffect(() => setPage(0), [query, region, year, scope, sort, buildingId]);
  const pages = Math.max(1, Math.ceil(rows.length / 20)),
    current = Math.min(page, pages - 1);
  return (
    <section className={buildingId ? "asset-section" : "transactions-page"}>
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            {buildingId ? "ASSET HISTORY" : "MARKET ARCHIVE"}
          </span>
          <h1>{buildingId ? "거래 이력" : "매매사례"}</h1>
          <p>
            {buildingId
              ? "한 건물의 거래를 시간의 흐름으로 살펴봅니다."
              : "가격뿐 아니라, 무엇이 어떤 조건으로 거래됐는지 살펴보세요."}
          </p>
        </div>
        <span className="record-count">{rows.length.toLocaleString()}건</span>
      </div>
      <div className="record-filters">
        <label>
          거래연도
          <select
            aria-label="거래연도"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          >
            <option value="">전체 연도</option>
            {[...new Set(base.map((t) => t.year).filter((t) => t != null))]
              .sort((a, b) => b - a)
              .map((y) => (
                <option key={y}>{y}</option>
              ))}
          </select>
        </label>
        <label>
          매입범위
          <select
            aria-label="매입범위"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            <option value="">전체 범위</option>
            {[...new Set(base.map((t) => t.scope).filter(Boolean))]
              .sort()
              .map((s) => (
                <option key={s}>{s}</option>
              ))}
          </select>
        </label>
        <label className="sort-control">
          정렬
          <select
            aria-label="거래 정렬"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="recent">최근 거래순</option>
            <option value="amount">거래금액 높은순</option>
          </select>
        </label>
        {(year || scope) && (
          <button
            onClick={() => {
              setYear("");
              setScope("");
            }}
          >
            필터 초기화
          </button>
        )}
      </div>
      {rows.length ? (
        <>
          <div className="table-scroll transaction-table">
            <table>
              <thead>
                <tr>
                  <th>거래시점</th>
                  <th>건물 / 권역</th>
                  <th>거래금액</th>
                  <th>실제 거래면적</th>
                  <th>원문 평당가</th>
                  <th>매입범위</th>
                  <th>매수인 / 매도인</th>
                  <th>
                    <span className="sr-only">상세</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(current * 20, current * 20 + 20).map((t) => (
                  <tr key={t.id}>
                    <td>{t.year ? `${t.year}년` : "미확인"}</td>
                    <td>
                      <button
                        className="text-button building-link"
                        onClick={() => setDetail(t)}
                      >
                        {t.building_name}
                      </button>
                      <small>
                        {t.region}
                        {t.link_status === "candidate"
                          ? " · 자산 연결 검수 전"
                          : ""}
                      </small>
                    </td>
                    <td className="strong-number">{money(t.amount_won)}</td>
                    <td>{transactionArea(t.traded_area_m2)}</td>
                    <td>{unitPrice(t)}</td>
                    <td>
                      <span className="pill">{t.scope || "미확인"}</span>
                    </td>
                    <td className="parties">
                      {t.buyer || "미확인"}
                      <small>{t.seller || "미확인"}</small>
                    </td>
                    <td>
                      <button
                        aria-label={`${t.building_name} ${t.year}년 거래 상세`}
                        onClick={() => setDetail(t)}
                      >
                        <ChevronRight size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <span>
              총 {rows.length}건 · {current + 1} / {pages}
            </span>
            <button
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              이전
            </button>
            <button
              disabled={current >= pages - 1}
              onClick={() => setPage(current + 1)}
            >
              다음
            </button>
          </div>
        </>
      ) : (
        <Blank
          title={
            base.length
              ? "조건에 맞는 거래가 없습니다"
              : "거래 정보를 공개 준비 중입니다"
          }
        >
          {base.length
            ? "검색어나 필터를 변경해 보세요."
            : "검수 계정으로 로그인하면 수집된 거래 기록을 확인할 수 있습니다."}
        </Blank>
      )}
      <p className="context-note">
        건물 연면적과 거래면적은 다를 수 있습니다. 일부 층·지분 거래는 전체 건물
        매매와 구분해서 확인하세요.
      </p>
      {detail && (
        <TransactionDialog
          transaction={detail}
          onClose={() => setDetail(null)}
          onBuilding={onBuilding}
        />
      )}
    </section>
  );
}
const tabs = [
  "개요",
  "임대 정보",
  "임차기업",
  "거래 이력",
  "개발·변경 이력",
] as const;
type AssetTab = (typeof tabs)[number];
export function AssetWorkspace({
  building: b,
  catalog,
  onClose,
  onBuilding,
  saved,
  onSave,
}: {
  building: Building;
  catalog: Catalog;
  onClose: () => void;
  onBuilding: (id: string) => void;
  saved: boolean;
  onSave: () => void;
}) {
  const [tab, setTab] = useState<AssetTab>("개요"),
    [tenantQuery, setTenantQuery] = useState(""),
    [tenantView, setTenantView] = useState("list"),
    [companyId, setCompanyId] = useState<string | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const towerRows = towersFor(b, catalog.towers || []);
  useEffect(() => {
    setTab("개요");
    setCompanyId(null);
    setTenantQuery("");
    setTenantView("list");
    title.current?.focus();
  }, [b.id]);
  const trades = filterTransactions(
    catalog.transactions.filter((t) => t.building_id === b.id),
    "",
    "",
    "",
    "",
    "recent",
  );
  const leases = catalog.leasing
    .filter((t) => t.building_id === b.id)
    .sort((a, b) => b.period.localeCompare(a.period));
  const developments = catalog.developments.filter(
    (t) => t.building_id === b.id,
  );
  const developmentSummary = markerDevelopmentIndex(developments).get(b.id);
  const { confirmed, other } = occupancyGroups(catalog.occupancies, b.id);
  const moves = catalog.movements
    .filter((t) => t.from_building_id === b.id || t.to_building_id === b.id)
    .sort((a, b) => b.period.localeCompare(a.period));
  const company = catalog.companies.find((c) => c.id === companyId);
  const filteredTenants = confirmed.filter((o) => {
    const c = catalog.companies.find((c) => c.id === o.company_id);
    return `${c?.name} ${c?.industry}`
      .toLowerCase()
      .includes(tenantQuery.toLowerCase());
  });
  const evidence = {
    source_name: b.source_name,
    source_url: b.source_url,
    as_of: b.source_as_of || b.verified_on,
  };
  return (
    <section className="asset-page" aria-label={`${b.name} 자산 상세`}>
      <div className="asset-back">
        <button onClick={onClose}>
          <ArrowLeft size={15} />
          목록으로
        </button>
        <span>ASSET ARCHIVE</span>
      </div>
      <div className="asset-hero">
        <div className="asset-symbol">
          <BuildingPhoto image={primaryImage(catalog.images, b.id)} />
        </div>
        <div className="asset-title">
          <div className="asset-tags">
            <span className="pill">{b.region}</span>
            <span className="pill">
              {b.status === "operating" ? "운영 자산" : "개발 예정"}
            </span>
            {catalog.review && (
              <span className="subtle-label">자료 기준 · 검수 전</span>
            )}
          </div>
          <h1 ref={title} tabIndex={-1}>
            {b.name}
          </h1>
          <p>
            <MapPin size={13} />
            {b.address}
          </p>
        </div>
        <button className="save-asset" aria-pressed={saved} onClick={onSave}>
          <Bookmark size={16} fill={saved ? "currentColor" : "none"} />
          {saved ? "저장됨" : "관심 건물"}
        </button>
      </div>
      {primaryImage(catalog.images, b.id) &&
        (() => {
          const photo = primaryImage(catalog.images, b.id)!;
          return (
            <figure className="asset-photo">
              <BuildingPhoto image={photo} detail />
              <figcaption>
                {photo.kind === "rendering" ? "조감도 · " : ""}
                {photo.credit || photo.source_name}
                {photo.license_name ? ` · ${photo.license_name}` : ""}
                {photo.captured_on ? ` · 촬영 ${photo.captured_on}` : ""}
                {safeSourceUrl(photo.source_url) && (
                  <a
                    href={safeSourceUrl(photo.source_url)!}
                    target="_blank"
                    rel="noreferrer"
                  >
                    출처
                  </a>
                )}
              </figcaption>
            </figure>
          );
        })()}
      <div className="asset-metrics">
        <div>
          <span>연면적{b.area_basis === "planned" ? " · 계획" : ""}</span>
          <strong>{formatArea(b.gross_area_m2)}</strong>
          <small>{numeric(b.gross_area_m2, "㎡")}</small>
        </div>
        <div>
          <span>최근 거래금액</span>
          <strong>{trades[0] ? money(trades[0].amount_won) : "미확인"}</strong>
          <small>
            {trades[0]
              ? `${trades[0].year}년 · ${trades[0].scope}${trades[0].link_status === "candidate" ? " · 연결 후보" : ""}`
              : "확인된 거래 기록 기준"}
          </small>
        </div>
        <div>
          <span>확인된 입주기업</span>
          <strong>
            {confirmed.length ? `${confirmed.length}개사` : "미확인"}
          </strong>
          <small>과거 이전 사례와 별도 관리</small>
        </div>
        <div>
          <span>자료 기준</span>
          <strong>{b.source_as_of || b.verified_on || "미확인"}</strong>
          <small>{b.verified_on ? "검수 완료" : "현행 정보 검수 전"}</small>
        </div>
      </div>
      <div className="asset-tabs" role="tablist" aria-label="자산 정보">
        {tabs.map((t, i) => (
          <button
            key={t}
            id={`asset-tab-${i}`}
            role="tab"
            aria-selected={tab === t}
            aria-controls="asset-panel"
            tabIndex={tab === t ? 0 : -1}
            onKeyDown={(e) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
                e.preventDefault();
                const next =
                  e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? tabs.length - 1
                      : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) %
                        tabs.length;
                setTab(tabs[next]);
                document.getElementById(`asset-tab-${next}`)?.focus();
              }
            }}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div
        className="asset-body"
        id="asset-panel"
        role="tabpanel"
        aria-labelledby={`asset-tab-${tabs.indexOf(tab)}`}
      >
        {tab === "개요" && (
          <>
            <div className="overview-grid">
              <section className="info-panel">
                <div className="section-heading">
                  <h2>공간의 기본 정보</h2>
                  <Building2 size={18} />
                </div>
                <p className="asset-intro">
                  {b.overview ||
                    "건물의 규모와 입지, 입주기업과 거래 이력을 한곳에서 살펴보세요."}
                </p>
                <dl>
                  <div>
                    <dt>주소</dt>
                    <dd>{b.address}</dd>
                  </div>
                  <div>
                    <dt>연면적 기준</dt>
                    <dd>
                      {b.area_basis === "actual"
                        ? "실제 연면적"
                        : "계획 연면적"}
                    </dd>
                  </div>
                  <div>
                    <dt>규모</dt>
                    <dd>
                      {b.floors_above != null
                        ? `지상 ${b.floors_above}층`
                        : "미확인"}
                      {b.floors_below != null
                        ? ` / 지하 ${b.floors_below}층`
                        : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>
                      {b.status === "development" ? "준공 예정" : "준공연도"}
                    </dt>
                    <dd
                      title={
                        b.usage_approved_on
                          ? `사용승인일 ${b.usage_approved_on}`
                          : undefined
                      }
                    >
                      {b.status === "development"
                        ? developmentSummary?.completion || "미확인"
                        : b.completion_year || "미확인"}
                    </dd>
                  </div>
                  <div>
                    <dt>기준층 임대면적</dt>
                    <dd>
                      {towerRows.length
                        ? towerFloorText(towerRows, "rentable")
                        : numeric(
                            b.typical_floor_rentable_pyeong ?? null,
                            "평",
                          )}
                    </dd>
                  </div>
                  <div>
                    <dt>기준층 전용면적</dt>
                    <dd>
                      {towerRows.length
                        ? towerFloorText(towerRows, "exclusive")
                        : numeric(
                            b.typical_floor_exclusive_pyeong ?? null,
                            "평",
                          )}
                    </dd>
                  </div>
                  <div>
                    <dt>주차</dt>
                    <dd>{numeric(b.parking_spaces, "대")}</dd>
                  </div>
                </dl>
                <Source item={evidence} />
                {b.completion_source_url && (
                  <Source
                    item={{
                      source_name: "준공연도 · 오피스파인드 사용승인일 기준",
                      source_url: b.completion_source_url,
                      as_of: null,
                    }}
                  />
                )}
                {b.typical_floor_scope && !towerRows.length && (
                  <p className="context-note">{b.typical_floor_scope}</p>
                )}
                {b.typical_floor_source_url && !towerRows.length && (
                  <Source
                    item={{
                      source_name: "기준층 면적 · 오피스파인드",
                      source_url: b.typical_floor_source_url,
                      as_of: b.typical_floor_source_period ?? null,
                    }}
                  />
                )}
                {towerRows.map((t) => (
                  <Source
                    key={t.id}
                    item={{
                      source_name: `${t.label} 기준층 · ${t.source_url ? "오피스파인드" : "자료 미확인"}`,
                      source_url: t.source_url,
                      as_of: t.source_period,
                    }}
                  />
                ))}
              </section>
              <section className="info-panel">
                <div className="section-heading">
                  <h2>자산 기록</h2>
                  <Clock3 size={18} />
                </div>
                {[
                  [
                    "임대 정보",
                    `${leases.length}개 분기`,
                    "기준시점별 임대 조건",
                  ],
                  [
                    "임차기업",
                    confirmed.length
                      ? `${confirmed.length}개사`
                      : "자료 수집 예정",
                    "입주 현황과 과거 이전 기록",
                  ],
                  [
                    "거래 이력",
                    `${trades.length}건`,
                    "거래 범위와 금액의 변화",
                  ],
                  [
                    "개발·변경 이력",
                    `${developments.length}건`,
                    "인허가부터 준공까지",
                  ],
                ].map(([name, count, desc]) => (
                  <button
                    className="archive-link"
                    key={name}
                    onClick={() => setTab(name as AssetTab)}
                  >
                    <span>
                      <strong>{name}</strong>
                      <small>{desc}</small>
                    </span>
                    <span>
                      {count}
                      <ChevronRight size={15} />
                    </span>
                  </button>
                ))}
              </section>
            </div>
            <section className="info-panel recent-trade">
              <div className="section-heading">
                <h2>최근 거래</h2>
                <button
                  className="text-button"
                  onClick={() => setTab("거래 이력")}
                >
                  전체 이력
                  <ArrowRight size={14} />
                </button>
              </div>
              {trades[0] ? (
                <>
                  <div className="recent-trade-summary">
                    <span>{trades[0].year}년</span>
                    <strong>{money(trades[0].amount_won)}</strong>
                    <span>
                      {trades[0].scope} · 거래면적{" "}
                      {transactionArea(trades[0].traded_area_m2)}
                    </span>
                  </div>
                  <p className="context-note">
                    {trades[0].link_status === "candidate"
                      ? "건물명·권역으로 연결된 후보 기록이며 동일 자산 확인 전입니다."
                      : "공개 검수된 거래 기록입니다."}
                  </p>
                </>
              ) : (
                <p className="context-note">
                  확인된 거래 기록을 준비하고 있습니다.
                </p>
              )}
            </section>
          </>
        )}
        {tab === "임대 정보" && (
          <section className="asset-section">
            <div className="section-heading">
              <div>
                <h2>분기별 임대 조건</h2>
                <p>
                  기준시점이 같은 정보를 비교하세요. 미확인은 0을 의미하지
                  않습니다.
                </p>
              </div>
            </div>
            {leases.length ? (
              <>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        {[
                          "기준분기",
                          "보증금 (원/평)",
                          "월임대료 (원/평)",
                          "관리비 (원/평)",
                          "NOC (원/평)",
                          "공실률",
                          "렌트프리 (개월/년)",
                        ].map((x) => (
                          <th key={x}>{x}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {leases.map((l) => (
                        <tr key={l.id}>
                          <th>{l.period}</th>
                          <td>{numeric(l.deposit)}</td>
                          <td>{numeric(l.rent)}</td>
                          <td>{numeric(l.fee)}</td>
                          <td>{numeric(l.noc)}</td>
                          <td>
                            {numeric(
                              l.vacancy == null ? null : l.vacancy * 100,
                              "%",
                            )}
                          </td>
                          <td>{numeric(l.rent_free)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="context-note">
                  {leases[0].area_basis} · {leases[0].vat_basis}. NOC는 원문
                  값이며 별도로 재산출하지 않았습니다.
                </p>
                <Source item={leases[0]} />
              </>
            ) : (
              <Blank title="임대 조건을 수집하고 있습니다">
                확인된 기준분기와 면적·금액 단위를 함께 기록합니다.
              </Blank>
            )}
          </section>
        )}
        {tab === "임차기업" && (
          <section className="asset-section">
            <div className="section-heading">
              <div>
                <h2>입주기업</h2>
                <p>현재 입주가 확인된 기업과 과거 기록을 구분합니다.</p>
              </div>
              <Users size={20} />
            </div>
            <div className="tenant-controls">
              <div className="search">
                <Search size={16} />
                <input
                  aria-label="입주기업 검색"
                  placeholder="기업명 또는 업종 검색"
                  value={tenantQuery}
                  onChange={(e) => setTenantQuery(e.target.value)}
                />
              </div>
              <div className="segmented">
                <button
                  aria-pressed={tenantView === "list"}
                  onClick={() => setTenantView("list")}
                >
                  기업 목록
                </button>
                <button
                  aria-pressed={tenantView === "floor"}
                  onClick={() => setTenantView("floor")}
                >
                  층별 보기
                </button>
              </div>
            </div>
            {filteredTenants.length ? (
              tenantView === "list" ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        {[
                          "기업명",
                          "업종",
                          "입주 층",
                          "사용면적",
                          "입주 시점",
                          "정보 기준일",
                        ].map((t) => (
                          <th key={t}>{t}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTenants.map((o) => {
                        const c = catalog.companies.find(
                          (c) => c.id === o.company_id,
                        );
                        return (
                          <tr key={o.id}>
                            <td>
                              <button
                                className="text-button"
                                onClick={() => setCompanyId(o.company_id)}
                              >
                                {c?.name || "기업 정보 미확인"}
                                <ArrowUpRight size={13} />
                              </button>
                            </td>
                            <td>{c?.industry || "미확인"}</td>
                            <td>{o.floors || "미확인"}</td>
                            <td>{numeric(o.area_m2, "㎡")}</td>
                            <td>{o.started_on || "미확인"}</td>
                            <td>{o.as_of || "미확인"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="floor-list">
                  {[...filteredTenants]
                    .sort((a, b) =>
                      (b.floors || "").localeCompare(a.floors || "", "ko", {
                        numeric: true,
                      }),
                    )
                    .map((o) => (
                      <div key={o.id}>
                        <strong>{o.floors || "층 미확인"}</strong>
                        <button onClick={() => setCompanyId(o.company_id)}>
                          {catalog.companies.find((c) => c.id === o.company_id)
                            ?.name || "기업 정보 미확인"}
                        </button>
                        <span>
                          {numeric(o.area_m2, "㎡")} · 기준{" "}
                          {o.as_of || "미확인"}
                        </span>
                      </div>
                    ))}
                </div>
              )
            ) : (
              <Blank
                title={
                  confirmed.length
                    ? "검색 결과가 없습니다"
                    : "현재 입주기업 정보를 수집하고 있습니다"
                }
              >
                {confirmed.length
                  ? "다른 기업명이나 업종으로 검색해 보세요."
                  : "기업명 · 업종 · 입주 층 · 사용면적 · 입주 시점 · 정보 기준일을 확인해 채워갑니다. 아래의 과거 이전 기록은 현재 입주를 의미하지 않습니다."}
              </Blank>
            )}
            {company && (
              <div className="info-panel company-panel">
                <div className="section-heading">
                  <h2>{company.name}</h2>
                  <button
                    aria-label="기업 정보 닫기"
                    onClick={() => setCompanyId(null)}
                  >
                    <X size={17} />
                  </button>
                </div>
                <p>{company.industry || "업종 미확인"}</p>
                <p className="context-note">
                  {company.overview || "기업 소개를 준비하고 있습니다."}
                </p>
                {catalog.occupancies
                  .filter((o) => o.company_id === company.id)
                  .map((o) => (
                    <div className="company-location" key={o.id}>
                      <button onClick={() => onBuilding(o.building_id)}>
                        {catalog.buildings.find((b) => b.id === o.building_id)
                          ?.name || "건물 미확인"}
                        <ArrowUpRight size={13} />
                      </button>
                      <span>
                        {o.status === "confirmed" && !o.ended_on
                          ? "입주 확인"
                          : "과거·미확인"}{" "}
                        · {o.as_of || "기준일 미확인"}
                      </span>
                    </div>
                  ))}
              </div>
            )}
            {other.length > 0 && (
              <p className="context-note">
                현재 입주로 확정되지 않은 입주 기록 {other.length}건이 있습니다.
              </p>
            )}
            <div className="section-heading history-heading">
              <div>
                <h2>과거 임차이전 기록</h2>
                <p>
                  이전·확장 시점의 기록입니다.
                  {catalog.review
                    ? " 건물 연결은 명칭·권역 기준 검수 후보입니다."
                    : ""}
                </p>
              </div>
              <span className="record-count">{moves.length}건</span>
            </div>
            {moves.length ? (
              <div className="movement-list">
                {moves.map((m) => (
                  <article key={m.id}>
                    <div>
                      <span className="pill">{m.period}</span>
                      <span className="subtle-label">{m.kind}</span>
                    </div>
                    <h3>{m.company_name}</h3>
                    <p>
                      {m.from_name || "출발 미확인"}
                      <ArrowRight size={13} />
                      {m.to_name || "도착 미확인"}
                    </p>
                    <Source item={m} />
                  </article>
                ))}
              </div>
            ) : (
              <p className="context-note">
                연결된 과거 임차이전 기록이 없습니다.
              </p>
            )}
          </section>
        )}
        {tab === "거래 이력" && (
          <Transactions
            catalog={catalog}
            query=""
            region=""
            onBuilding={onBuilding}
            buildingId={b.id}
          />
        )}
        {tab === "개발·변경 이력" && (
          <section className="asset-section">
            <div className="section-heading">
              <div>
                <h2>개발·변경 이력</h2>
                <p>계획과 실제 진행상황을 구분해 기록합니다.</p>
              </div>
            </div>
            {developments.length ? (
              developments.map((d) => (
                <div className="info-panel" key={d.id}>
                  <p className="eyebrow">계획 기준 · 현행 진행상황 별도 확인</p>
                  <h2 className="development-year">
                    {d.year} {d.quarter} 준공 예정
                  </h2>
                  <dl>
                    {[
                      ["건축허가", d.permit],
                      ["실제 착공", d.started],
                      ["소유주·시행주체", d.developer],
                      ["시공사", d.contractor],
                      ["원문 진행상황", d.progress],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value || "미확인"}</dd>
                      </div>
                    ))}
                  </dl>
                  <Source item={d} />
                </div>
              ))
            ) : (
              <Blank title="확인된 개발·변경 기록이 없습니다">
                인허가, 착공, 준공과 리모델링 등 주요 변경을 출처·시점과 함께
                기록합니다.
              </Blank>
            )}
          </section>
        )}
      </div>
    </section>
  );
}
