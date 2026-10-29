import { scopedRows } from "../lib/shared-asset";
import { stationSource } from "../lib/subway-stations";
import { assetDetailTabs, type AssetTab } from "../lib/asset-detail-access";
import {
  ReviewValue as RV,
  ReviewRecordButton,
  AssetHistoryButton,
  useDataReviewVersion,
  DataReviewBoundary,
} from "./DataReview";
import BuildingRegister from "./BuildingRegister";
import AssetOverview from "./AssetOverview";
import MarketRentCalculator from "./MarketRentCalculator";
import { latestMarketLease } from "../lib/market-rent-calculator";
import { useScrollSections } from "./useScrollSections";
import { AreaUnitProvider, useAreaUnit } from "./AreaUnit";
import { fetchTransactionDetail } from "../lib/member-details";
import {
  markerDevelopmentIndex,
  markerNocIndex,
} from "../lib/map-marker-facts";
import { useAssetContext } from "../lib/asset-context";
import { LandPanel, SurroundingsPanel } from "./AssetContextPanels";
import { towersFor } from "../lib/building-towers";
import BuildingPhoto from "./BuildingPhoto";
import AssetMedia from "./AssetMedia";
import AssetActions from "./AssetActions";
import { districts } from "../lib/map-regions";
import { primaryImage } from "../lib/building-images";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  RotateCw,
  Building2,
  Check,
  ChevronRight,
  Clock3,
  LockKeyhole,
  FileText,
  MapPin,
  Search,
  Users,
  X,
} from "lucide-react";
import type { Building } from "../lib/domain";
import { assetCategoryOptions, safeSourceUrl } from "../lib/domain";
import {
  filterTransactions,
  money,
  numeric,
  occupancyGroups,
  unitPrice,
  type Catalog,
  type Evidence,
  type Transaction,
} from "../lib/catalog";

const IgisOperationsPanel = lazy(() => import("./IgisOperationsPanel"));
const IgisAssetPanel = lazy(() => import("./IgisAssetPanel"));
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
type TransactionDialogProps = {
  transaction: Transaction;
  onClose: () => void;
  onBuilding: (id: string) => void;
};
function TransactionDialog(props: TransactionDialogProps) {
  return (
    <DataReviewBoundary>
      <TransactionDialogContent {...props} />
    </DataReviewBoundary>
  );
}
function TransactionDialogContent({
  transaction,
  onClose,
  onBuilding,
}: TransactionDialogProps) {
  const { formatArea: transactionArea } = useAreaUnit();
  const [t, setTransaction] = useState(transaction);
  const version = useDataReviewVersion();
  useEffect(() => {
    if (!version) return;
    let active = true;
    void fetchTransactionDetail(transaction.id)
      .then((r) => {
        if (active) setTransaction(r);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [version, transaction.id]);
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
      <h2>
        <RV entity="transactions" id={t.id} field="building_name">
          {t.building_name}
        </RV>
      </h2>
      <div className="transaction-price">
        <RV entity="transactions" id={t.id} field="amount_won">
          {money(t.amount_won)}
        </RV>
        <span>거래금액 · 원화</span>
      </div>
      <dl>
        <div>
          <dt>매입 범위</dt>
          <dd>
            <RV entity="transactions" id={t.id} field="scope">
              {t.scope || "미확인"}
            </RV>
          </dd>
        </div>
        <div>
          <dt>거래 유형</dt>
          <dd>
            <RV entity="transactions" id={t.id} field="kind">
              {t.kind || "미확인"}
            </RV>
          </dd>
        </div>
        <div>
          <dt>건물 전체 연면적</dt>
          <dd>
            <RV entity="transactions" id={t.id} field="building_area_m2">
              {transactionArea(t.building_area_m2)}
            </RV>
          </dd>
        </div>
        <div>
          <dt>실제 거래면적</dt>
          <dd>
            <RV entity="transactions" id={t.id} field="traded_area_m2">
              {transactionArea(t.traded_area_m2)}
            </RV>
          </dd>
        </div>
        <div>
          <dt>원문 평당가</dt>
          <dd>
            <RV entity="transactions" id={t.id} field="unit_price_won">
              {unitPrice(t)}
            </RV>
          </dd>
        </div>
        <div>
          <dt>매도인</dt>
          <dd>
            <RV entity="transactions" id={t.id} field="seller">
              {t.seller || "미확인"}
            </RV>
          </dd>
        </div>
        <div>
          <dt>매수인</dt>
          <dd>
            <RV entity="transactions" id={t.id} field="buyer">
              {t.buyer || "미확인"}
            </RV>
          </dd>
        </div>
      </dl>
      <p className="context-note">
        평당가는 원문에 기재된 값입니다. 거래면적·지분·금액의 산정 범위를 확인한
        뒤 비교하세요.
      </p>
      {t.note && <p className="record-note">{t.note}</p>}

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
  canReadDetails = false,
  onRequireLogin,
  accessKey,
}: {
  catalog: Catalog;
  query: string;
  region: string;
  onBuilding: (id: string) => void;
  buildingId?: string;
  canReadDetails?: boolean;
  onRequireLogin?: () => void;
  accessKey?: string;
}) {
  const { formatArea: transactionArea } = useAreaUnit();
  const [year, setYear] = useState(""),
    [scope, setScope] = useState(""),
    [sort, setSort] = useState("recent"),
    [page, setPage] = useState(0),
    [detail, setDetail] = useState<Transaction | null>(null);
  const [requested, setRequested] = useState<string | null>(null);
  const [detailError, setDetailError] = useState("");
  const openDetail = (t: Transaction) => {
    setRequested(t.id);
    if (!canReadDetails) onRequireLogin?.();
  };
  useEffect(() => {
    setDetail(null);
    setDetailError("");
    if (!canReadDetails || !requested) return;
    let alive = true;
    void fetchTransactionDetail(requested)
      .then((data) => {
        if (alive) setDetail(data);
      })
      .catch(() => {
        if (alive)
          setDetailError(
            "거래 상세정보를 불러오지 못했습니다. 접근 권한을 확인해 주세요.",
          );
      });
    return () => {
      alive = false;
    };
  }, [canReadDetails, requested, accessKey]);
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
      <div className={buildingId ? "asset-content-card" : undefined}>
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
                      <td>
                        <RV entity="transactions" id={t.id} field="year">
                          {t.year ? `${t.year}년` : "미확인"}
                        </RV>
                      </td>
                      <td>
                        <button
                          className="text-button building-link"
                          onClick={() => openDetail(t)}
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
                      <td className="strong-number">
                        <RV entity="transactions" id={t.id} field="amount_won">
                          {money(t.amount_won)}
                        </RV>
                      </td>
                      <td>
                        <RV
                          entity="transactions"
                          id={t.id}
                          field="traded_area_m2"
                        >
                          {transactionArea(t.traded_area_m2)}
                        </RV>
                      </td>
                      <td>
                        <RV
                          entity="transactions"
                          id={t.id}
                          field="unit_price_won"
                        >
                          {unitPrice(t)}
                        </RV>
                      </td>
                      <td>
                        <span className="pill">
                          <RV entity="transactions" id={t.id} field="scope">
                            {t.scope || "미확인"}
                          </RV>
                        </span>
                      </td>
                      <td className="parties">
                        <RV entity="transactions" id={t.id} field="buyer">
                          {t.buyer || "미확인"}
                        </RV>
                        <small>
                          <RV entity="transactions" id={t.id} field="seller">
                            {t.seller || "미확인"}
                          </RV>
                        </small>
                      </td>
                      <td>
                        <button
                          aria-label={`${t.building_name} ${t.year}년 거래 상세`}
                          onClick={() => openDetail(t)}
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
                : "등록된 거래 정보가 없습니다"
            }
          >
            {base.length
              ? "검색어나 필터를 변경해 보세요."
              : "거래 정보가 등록되면 이곳에서 확인할 수 있습니다."}
          </Blank>
        )}
        <p className="context-note">
          건물 연면적과 거래면적은 다를 수 있습니다. 일부 층·지분 거래는 전체
          건물 매매와 구분해서 확인하세요.
        </p>
        {detailError && <p role="alert">{detailError}</p>}
      </div>
      {detail && canReadDetails && (
        <TransactionDialog
          transaction={detail}
          onClose={() => {
            setDetail(null);
            setRequested(null);
          }}
          onBuilding={onBuilding}
        />
      )}
    </section>
  );
}
export function AssetWorkspace(
  props: Parameters<typeof AssetWorkspaceContent>[0],
) {
  if (props.embedded) return <AssetWorkspaceContent {...props} />;
  return (
    <AreaUnitProvider key={props.building.id}>
      <AssetWorkspaceContent {...props} />
    </AreaUnitProvider>
  );
}
function AssetWorkspaceContent({
  building: b,
  catalog,
  onClose,
  onBuilding,
  saved,
  onSave,
  archiveStatus = "ready",
  onRetryArchive,
  onManageImages,
  embedded = false,
  sharedOverview,
  canReadIgis = false,
  onRequireLogin,
}: {
  building: Building;
  catalog: Catalog;
  onClose: () => void;
  onBuilding: (id: string) => void;
  saved: boolean;
  onSave: () => void;
  archiveStatus?: "idle" | "loading" | "ready" | "error";
  onRetryArchive?: () => void;
  onManageImages?: () => void;
  embedded?: boolean;
  sharedOverview?: React.ReactNode;
  canReadIgis?: boolean;
  onRequireLogin?: () => void;
}) {
  const { unit, setUnit, formatArea, perPyeong } = useAreaUnit();
  const transactionArea = formatArea;
  const [tenantQuery, setTenantQuery] = useState(""),
    [tenantView, setTenantView] = useState("list"),
    [companyId, setCompanyId] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [marketEfficiency, setMarketEfficiency] = useState<number | null>(null);
  const [addressMode, setAddressMode] = useState<"parcel" | "road">("parcel");
  const addresses = [b.standard_address, b.address, b.source_address].filter(
    Boolean,
  ) as string[];
  const isRoad = (value: string) => /(?:대로|로|길)\s*\d/.test(value);
  const parcelAddress = addresses.find((value) => !isRoad(value)) || "";
  const roadAddress = b.road_address || addresses.find(isRoad) || "";
  const showRoad = addressMode === "road" || !parcelAddress;
  const shownAddress = showRoad ? roadAddress || b.address : parcelAddress;
  const title = useRef<HTMLHeadingElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLElement>(null);
  const reviewVersion = useDataReviewVersion();
  const tabs = assetDetailTabs(b);
  const {
    active: tab,
    loaded: loadedSections,
    goTo: goToSection,
  } = useScrollSections(page, tabs);
  const ownContext = useAssetContext(
    b.id,
    sourcesOpen ? [...loadedSections, "자료 출처"] : loadedSections,
    reviewVersion,
  );
  const sharedCatalog = catalog.sharedAsset;
  const sharedBuilding = sharedCatalog?.buildings[0];
  const sharedContext = useAssetContext(
    sharedBuilding?.id || b.id,
    sharedBuilding
      ? sourcesOpen
        ? [...loadedSections, "자료 출처"]
        : loadedSections
      : [],
    reviewVersion,
  );
  const overviewBuilding = catalog.overviewAsset?.buildings[0];
  const overviewContext = useAssetContext(
    overviewBuilding?.id || b.id,
    overviewBuilding && overviewBuilding.id !== sharedBuilding?.id
      ? loadedSections
      : [],
    reviewVersion,
  );
  const pickContext = <T,>(
    own: { data: T | null; error: boolean },
    shared: { data: T | null; error: boolean },
    has: (value: T) => boolean,
  ) =>
    own.data && has(own.data)
      ? own
      : sharedBuilding && shared.data && has(shared.data)
        ? shared
        : own;
  const context = {
    ...ownContext,
    register: pickContext(
      ownContext.register,
      sharedContext.register,
      (d) => !!d.records.length,
    ),
    parcels: pickContext(
      ownContext.parcels,
      sharedContext.parcels,
      (d) => !!d.length,
    ),
    places: pickContext(
      ownContext.places,
      sharedContext.places,
      (d) => !!d.length,
    ),
    facts: pickContext(
      ownContext.facts,
      sharedContext.facts,
      (d) => !!d.length,
    ),
    natureSources: pickContext(
      ownContext.natureSources,
      sharedContext.natureSources,
      (d) => !!d.length,
    ),
    retry: () => {
      ownContext.retry();
      sharedContext.retry();
    },
  };
  const leasesSource = scopedRows(catalog.leasing, sharedCatalog?.leasing);
  const tradesSource = scopedRows(
    catalog.transactions,
    sharedCatalog?.transactions,
  );
  const developmentsSource = scopedRows(
    catalog.developments,
    sharedCatalog?.developments,
  );
  const occupanciesSource = scopedRows(
    catalog.occupancies,
    sharedCatalog?.occupancies,
  );
  const movesSource = scopedRows(catalog.movements, sharedCatalog?.movements);
  const occupancyBuildingId = occupanciesSource.inherited
    ? sharedBuilding!.id
    : b.id;
  const companies = [...catalog.companies, ...(sharedCatalog?.companies || [])];
  const photos = catalog.images.filter(
    (p) =>
      p.building_id === b.id &&
      p.review_status === "approved" &&
      p.kind !== "floor_plan",
  );
  const floorPlans = catalog.images
    .filter(
      (p) =>
        p.building_id === b.id &&
        p.review_status === "approved" &&
        p.kind === "floor_plan",
    )
    .sort(
      (a, b) =>
        (a.sort_order || 0) - (b.sort_order || 0) ||
        a.title.localeCompare(b.title),
    );
  photos.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const representativePhotoId =
    primaryImage(catalog.images, b.id)?.id ?? photos[0]?.id;
  const [photoId, setPhotoId] = useState(representativePhotoId);
  useEffect(
    () => setPhotoId(representativePhotoId),
    [b.id, representativePhotoId],
  );
  const photo = photos.find((p) => p.id === photoId) ?? photos[0];
  const noc = markerNocIndex(leasesSource.rows).get(
    leasesSource.inherited ? sharedBuilding!.id : b.id,
  );
  const towerRows = embedded
    ? (catalog.towers || []).filter(
        (t) =>
          t.building_id === b.id &&
          !t.parent_tower_id &&
          t.component_kind !== "facility",
      )
    : towersFor(b, catalog.towers || []);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    if (!embedded) title.current?.focus({ preventScroll: true });
    return () => {
      if (!embedded && previous?.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    setSourcesOpen(false);
    setMarketEfficiency(null);
    setCompanyId(null);
    setTenantQuery("");
    setTenantView("list");
    if (!embedded) title.current?.focus();
  }, [b.id]);
  const trades = filterTransactions(
    tradesSource.rows,
    "",
    "",
    "",
    "",
    "recent",
  );
  const leases = leasesSource.rows.sort((a, b) =>
    b.period.localeCompare(a.period),
  );
  const latestLease = latestMarketLease(leases);
  const developments = developmentsSource.rows;
  const developmentSummary = markerDevelopmentIndex(developments).get(
    developmentsSource.inherited ? sharedBuilding!.id : b.id,
  );
  const currentDevelopment = [...developments].sort((a, b) =>
    (b.as_of || "").localeCompare(a.as_of || ""),
  )[0];
  const floorValues = (kind: "rentable" | "exclusive") => {
    const field =
      kind === "rentable"
        ? "typical_floor_rentable_pyeong"
        : "typical_floor_exclusive_pyeong";
    return towerRows.length && !(embedded && b[field] != null) ? (
      towerRows.map((t, i) => (
        <span key={t.id}>
          {i > 0 && " / "}
          <RV entity="building_towers" id={t.id} field={field}>
            {t.label}{" "}
            {t[field] != null && t[field]! > 0
              ? formatArea(t[field], "평")
              : "미확인"}
          </RV>
        </span>
      ))
    ) : (
      <RV entity="buildings" id={b.id} field={field}>
        {formatArea(b[field], "평")}
      </RV>
    );
  };
  const { confirmed, other } = occupancyGroups(
    occupanciesSource.rows,
    occupancyBuildingId,
  );
  const moves = movesSource.rows.sort((a, b) =>
    b.period.localeCompare(a.period),
  );
  const company = companies.find((c) => c.id === companyId);
  const filteredTenants = confirmed.filter((o) => {
    const c = companies.find((c) => c.id === o.company_id);
    return `${c?.name} ${c?.industry}`
      .toLowerCase()
      .includes(tenantQuery.toLowerCase());
  });
  const evidence = {
    source_name: b.source_name,
    source_url: b.source_url,
    as_of: b.source_as_of || b.verified_on,
  };
  const sectionContent: Record<AssetTab | "자료 출처", React.ReactNode> = {
    이지스: (
      <section className="asset-section">
        <div className="section-heading">
          <h2>이지스</h2>
        </div>
        {canReadIgis ? (
          <Suspense
            fallback={
              <p className="context-note">이지스 정보를 불러오고 있습니다.</p>
            }
          >
            <IgisOperationsPanel
              key={b.igis_source_building_id || b.id}
              buildingId={b.igis_source_building_id || b.id}
            />
            <IgisAssetPanel buildingId={b.igis_source_building_id || b.id} />
          </Suspense>
        ) : (
          <section className="info-panel igis-detail-locked">
            <LockKeyhole size={25} />
            <h2>이지스 내부정보</h2>
            <p>로그인 후 권한이 있는 정보만 확인할 수 있습니다.</p>
            <button type="button" className="primary" onClick={onRequireLogin}>
              로그인하고 보기
            </button>
          </section>
        )}
      </section>
    ),
    건축물대장: (
      <>
        <BuildingRegister
          key={b.id}
          buildingId={
            context.register === sharedContext.register
              ? sharedBuilding!.id
              : b.id
          }
          resource={context.register}
          onRetry={context.retry}
        />
      </>
    ),
    토지: (
      <>
        <LandPanel
          building={
            context.parcels === sharedContext.parcels ? sharedBuilding! : b
          }
          parcels={context.parcels}
          register={context.register}
          onRetry={context.retry}
        />
      </>
    ),
    주변: (
      <>
        <SurroundingsPanel
          building={b}
          places={context.places}
          onRetry={context.retry}
        />
      </>
    ),
    "자료 출처": (
      <section className="info-panel">
        <div className="section-heading">
          <div>
            <h2>자료 출처와 기준일</h2>
            <p>항목별 출처와 수집 시점은 서로 다를 수 있습니다.</p>
          </div>
        </div>
        <div className="asset-source-list">
          {[
            evidence,
            ...(b.completion_source_url
              ? [
                  {
                    source_name: "준공연도 · 사용승인일",
                    source_url: b.completion_source_url,
                    as_of: b.completion_collected_at?.slice(0, 10) || null,
                  },
                ]
              : []),
            ...(b.typical_floor_source_url
              ? [
                  {
                    source_name: "기준층 면적",
                    source_url: b.typical_floor_source_url,
                    as_of:
                      b.typical_floor_source_period ||
                      b.typical_floor_collected_at?.slice(0, 10) ||
                      null,
                  },
                ]
              : []),
            ...towerRows.map((t) => ({
              source_name: `${t.label} · 기준층 면적`,
              source_url: t.source_url,
              as_of: t.source_period || t.collected_at?.slice(0, 10) || null,
            })),
            ...(context.facts.data ?? []),
            ...(context.natureSources.data ?? []).map((g) => ({
              ...g,
              source_name: `${g.source_name} · 자연환경 (공원 기준점 반경 500m)`,
            })),
            stationSource,
            ...leases,
            ...developments,
            ...trades,
            ...moves,
            ...photos.map((p) => ({
              source_name: p.credit || p.source_name,
              source_url: p.source_url,
              as_of: p.source_date,
            })),
            ...(context.parcels.data ?? []),
            ...(context.places.data ?? []),
          ]
            .filter(
              (s, i, a) =>
                a.findIndex(
                  (x) =>
                    x.source_name === s.source_name &&
                    x.source_url === s.source_url &&
                    x.as_of === s.as_of,
                ) === i,
            )
            .map((s, i) => (
              <Source key={i} item={s} />
            ))}
          {context.register.data?.records.map((r) => (
            <Source
              key={r.id}
              item={{
                source_name: `국토교통부 건축물대장 · ${r.dong_name || r.building_name || "표제부"}`,
                source_url: "https://www.data.go.kr/data/15134735/openapi.do",
                as_of: r.collected_at.slice(0, 10),
              }}
            />
          ))}
        </div>
        <p className="context-note">
          시세 추정·매물 정보는 포함하지 않습니다. 값이 없는 항목은 0으로
          해석하지 않습니다.
        </p>
      </section>
    ),
    개요: (
      <>
        <div className="section-heading">
          <h2>개요</h2>
        </div>
        <div className="overview-grid">
          <AssetOverview
            building={b}
            onEfficiencyChange={setMarketEfficiency}
            floorValues={floorValues}
            places={
              (overviewBuilding
                ? (overviewBuilding.id === sharedBuilding?.id
                    ? sharedContext
                    : overviewContext
                  ).places.data
                : ownContext.places.data) || []
            }
            contractor={
              catalog.overviewComplex
                ? undefined
                : currentDevelopment?.contractor
            }
            register={ownContext.register.data}
            sharedBuilding={overviewBuilding}
            complex={catalog.overviewComplex}
            sharedRegister={
              overviewBuilding?.id === sharedBuilding?.id
                ? sharedContext.register.data
                : overviewContext.register.data
            }
          />
          {sharedOverview}
          <section className="info-panel">
            <div className="section-heading">
              <h2>자산 기록</h2>
              <Clock3 size={18} />
            </div>
            {[
              ["시장 임대", `${leases.length}개 분기`, "알스퀘어 시장 조사"],
              [
                "임차기업",
                confirmed.length ? `${confirmed.length}개사` : "자료 수집 예정",
                "입주 현황과 과거 이전 기록",
              ],
              ["거래 이력", `${trades.length}건`, "거래 범위와 금액의 변화"],
              [
                "개발·변경 이력",
                `${developments.length}건`,
                "인허가부터 준공까지",
              ],
            ].map(([name, count, desc]) => (
              <button
                className="archive-link"
                key={name}
                onClick={() => goToSection(name as AssetTab)}
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
              onClick={() => goToSection("거래 이력")}
            >
              전체 이력
              <ArrowRight size={14} />
            </button>
          </div>
          {trades[0] ? (
            <>
              <div className="recent-trade-summary">
                <span>
                  <RV entity="transactions" id={trades[0].id} field="year">
                    {trades[0].year}년
                  </RV>
                </span>
                <strong>
                  <RV
                    entity="transactions"
                    id={trades[0].id}
                    field="amount_won"
                  >
                    {money(trades[0].amount_won)}
                  </RV>
                </strong>
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
        {context.facts.error && (
          <div className="context-status" role="alert">
            추가 자산 정보를 불러오지 못했습니다.
            <button onClick={context.retry}>다시 불러오기</button>
          </div>
        )}
        {!!context.facts.data?.length && (
          <section className="info-panel recent-trade">
            <h3>추가 자산 정보</h3>
            <dl>
              {context.facts.data.map((f) => (
                <div key={f.id}>
                  <dt>{f.field_key.replaceAll("_", " ")}</dt>
                  <dd>
                    <RV entity="building_facts" id={f.id} field="value">
                      {typeof f.value === "object"
                        ? JSON.stringify(f.value)
                        : String(f.value)}
                      {f.unit ? ` ${f.unit}` : ""}
                    </RV>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </>
    ),
    "시장 임대": (
      <section className="asset-section">
        <div className="section-heading">
          <div>
            <h2>시장 임대</h2>
            <p>
              알스퀘어가 집계한 시장 조사 데이터입니다. 이지스의 실제 계약
              임대료·수납액·운영실적은 별도 권한으로 관리합니다.
            </p>
          </div>
        </div>
        <div className="asset-content-card">
          {latestLease && (
            <MarketRentCalculator
              key={b.id}
              lease={latestLease}
              efficiencyPct={marketEfficiency}
              typicalExclusivePyeong={
                b.typical_floor_exclusive_pyeong ??
                (towerRows.length === 1
                  ? towerRows[0].typical_floor_exclusive_pyeong
                  : null)
              }
            />
          )}
          {leases.length ? (
            <>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {[
                        "기준분기",
                        `보증금 (원/${unit})`,
                        `시장 월임대료 (원/${unit})`,
                        `관리비 (원/${unit})`,
                        `시장 NOC (원/${unit})`,
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
                        <th>
                          <RV
                            entity="leasing_quarters"
                            id={l.id}
                            field="period"
                          >
                            {l.period}
                          </RV>
                        </th>
                        <td>
                          <RV
                            entity="leasing_quarters"
                            id={l.id}
                            field="deposit"
                          >
                            {numeric(perPyeong(l.deposit))}
                          </RV>
                        </td>
                        <td>
                          <RV entity="leasing_quarters" id={l.id} field="rent">
                            {numeric(perPyeong(l.rent))}
                          </RV>
                        </td>
                        <td>
                          <RV entity="leasing_quarters" id={l.id} field="fee">
                            {numeric(perPyeong(l.fee))}
                          </RV>
                        </td>
                        <td>
                          <RV entity="leasing_quarters" id={l.id} field="noc">
                            {numeric(perPyeong(l.noc))}
                          </RV>
                        </td>
                        <td>
                          {numeric(
                            l.vacancy == null ? null : l.vacancy * 100,
                            "%",
                          )}
                        </td>
                        <td>
                          <RV
                            entity="leasing_quarters"
                            id={l.id}
                            field="rent_free"
                          >
                            {numeric(l.rent_free)}
                          </RV>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="context-note">
                {leases[0].area_basis} · {leases[0].vat_basis}. 원문 금액을
                선택한 면적 단위로 환산해 표시합니다.
              </p>
            </>
          ) : (
            <Blank title="임대 조건을 수집하고 있습니다">
              확인된 기준분기와 면적·금액 단위를 함께 기록합니다.
            </Blank>
          )}
        </div>
      </section>
    ),
    임차기업:
      archiveStatus === "ready" ? (
        <section className="asset-section">
          <div className="section-heading">
            <div>
              <h2>임차기업</h2>
              <p>현재 입주가 확인된 기업과 과거 기록을 구분합니다.</p>
            </div>
            <Users size={20} />
          </div>
          <div className="asset-content-card">
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
                        const c = companies.find((c) => c.id === o.company_id);
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
                            <td>
                              <RV
                                entity="companies"
                                id={c?.id}
                                field="industry"
                              >
                                {c?.industry || "미확인"}
                              </RV>
                            </td>
                            <td>
                              <RV entity="occupancies" id={o.id} field="floors">
                                {o.floors || "미확인"}
                              </RV>
                            </td>
                            <td>
                              <RV
                                entity="occupancies"
                                id={o.id}
                                field="area_m2"
                              >
                                {formatArea(o.area_m2)}
                              </RV>
                            </td>
                            <td>
                              <RV
                                entity="occupancies"
                                id={o.id}
                                field="started_on"
                              >
                                {o.started_on || "미확인"}
                              </RV>
                            </td>
                            <td>
                              <RV entity="occupancies" id={o.id} field="as_of">
                                {o.as_of || "미확인"}
                              </RV>
                            </td>
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
                        <strong>
                          <RV entity="occupancies" id={o.id} field="floors">
                            {o.floors || "층 미확인"}
                          </RV>
                        </strong>
                        <button onClick={() => setCompanyId(o.company_id)}>
                          {companies.find((c) => c.id === o.company_id)?.name ||
                            "기업 정보 미확인"}
                        </button>
                        <span>
                          <RV entity="occupancies" id={o.id} field="area_m2">
                            {formatArea(o.area_m2)}
                          </RV>{" "}
                          · 기준{" "}
                          <RV entity="occupancies" id={o.id} field="as_of">
                            {o.as_of || "미확인"}
                          </RV>
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
              <div className="company-panel">
                <div className="section-heading">
                  <h2>
                    <RV entity="companies" id={company.id} field="name">
                      {company.name}
                    </RV>
                  </h2>
                  <button
                    aria-label="기업 정보 닫기"
                    onClick={() => setCompanyId(null)}
                  >
                    <X size={17} />
                  </button>
                </div>
                <p>
                  <RV entity="companies" id={company.id} field="industry">
                    {company.industry || "업종 미확인"}
                  </RV>
                </p>
                <p className="context-note">
                  <RV entity="companies" id={company.id} field="overview">
                    {company.overview || "기업 소개를 준비하고 있습니다."}
                  </RV>
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
          </div>
          <div className="asset-content-card">
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
                      <span className="pill">
                        <RV entity="tenant_movements" id={m.id} field="period">
                          {m.period}
                        </RV>
                      </span>
                      <span className="subtle-label">
                        <RV entity="tenant_movements" id={m.id} field="kind">
                          {m.kind}
                        </RV>
                      </span>
                    </div>
                    <h3>
                      <RV
                        entity="tenant_movements"
                        id={m.id}
                        field="company_name"
                      >
                        {m.company_name}
                      </RV>
                    </h3>
                    <p>
                      <RV entity="tenant_movements" id={m.id} field="from_name">
                        {m.from_name || "출발 미확인"}
                      </RV>
                      <ArrowRight size={13} />
                      <RV entity="tenant_movements" id={m.id} field="to_name">
                        {m.to_name || "도착 미확인"}
                      </RV>
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="context-note">
                연결된 과거 임차이전 기록이 없습니다.
              </p>
            )}
          </div>
        </section>
      ) : (
        <div className="context-status" role="status">
          {archiveStatus === "error"
            ? "추가 정보를 불러오지 못했습니다."
            : "추가 정보를 불러오는 중입니다."}
          {archiveStatus === "error" && (
            <button onClick={onRetryArchive}>다시 시도</button>
          )}
        </div>
      ),
    "거래 이력":
      archiveStatus === "ready" ? (
        <>
          <Transactions
            catalog={tradesSource.inherited ? sharedCatalog! : catalog}
            query=""
            region=""
            onBuilding={onBuilding}
            buildingId={tradesSource.inherited ? sharedBuilding!.id : b.id}
            canReadDetails
          />
        </>
      ) : (
        <div className="context-status" role="status">
          {archiveStatus === "error"
            ? "추가 정보를 불러오지 못했습니다."
            : "추가 정보를 불러오는 중입니다."}
          {archiveStatus === "error" && (
            <button onClick={onRetryArchive}>다시 시도</button>
          )}
        </div>
      ),
    "개발·변경 이력": (
      <section className="asset-section">
        <div className="section-heading">
          <div>
            <h2>개발·변경 이력</h2>
            <p>계획과 실제 진행상황을 구분해 기록합니다.</p>
          </div>
        </div>
        <div className="asset-content-card development-timeline">
          {developments.length ? (
            developments.map((d) => (
              <div className="info-panel development-record" key={d.id}>
                <p className="eyebrow">계획 기준 · 현행 진행상황 별도 확인</p>
                <h2 className="development-year">
                  {/^\d{4}$/.test(d.year?.trim() || "")
                    ? `${d.year.trim()}년`
                    : d.year || "미확인"}{" "}
                  준공 예정
                </h2>
                <dl>
                  {[
                    ["건축허가", d.permit, "permit"],
                    ["실제 착공", d.started, "started"],
                    ["소유주·시행주체", d.developer, "developer"],
                    ["시공사", d.contractor, "contractor"],
                    ["원문 진행상황", d.progress, "progress"],
                  ].map(([label, value, key]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>
                        <RV
                          entity="development_records"
                          id={d.id}
                          field={key!}
                          label={label}
                        >
                          {value || "미확인"}
                        </RV>
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))
          ) : (
            <Blank title="확인된 개발·변경 기록이 없습니다">
              인허가, 착공, 준공과 리모델링 등 주요 변경을 출처·시점과 함께
              기록합니다.
            </Blank>
          )}
        </div>
      </section>
    ),
  };
  return (
    <div
      className={`asset-popup${embedded ? " asset-popup-embedded" : ""}`}
      ref={popup}
      role={embedded ? "region" : "dialog"}
      aria-modal={embedded ? undefined : "false"}
      aria-labelledby={`asset-detail-title-${b.id}`}
      onKeyDown={(e) => {
        if (
          e.key === "Escape" &&
          !e.defaultPrevented &&
          !(e.target as HTMLElement).closest("dialog")
        ) {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="asset-popup-toolbar">
        <AssetActions
          building={b}
          saved={saved}
          onSave={onSave}
          canPersonalize={canReadIgis}
          onRequireLogin={onRequireLogin}
        />
        <div className="asset-toolbar-secondary">
          <AssetHistoryButton compact />
          <button
            className="asset-popup-close"
            onClick={onClose}
            aria-label="상세 닫기"
          >
            <X size={21} />
          </button>
        </div>
      </div>
      <section
        ref={page}
        className="asset-page"
        aria-label={`${b.name} 자산 상세 내용`}
      >
        <div className="asset-summary">
          <div className="asset-hero">
            <div className="asset-title">
              <div className="asset-tags">
                <span className="pill">
                  {districts.find((item) => item.key === b.region)?.label ||
                    b.region}
                </span>
                <span className="pill">
                  {b.status === "operating" ? "운영중" : "개발중"}
                </span>
                <span className="pill">
                  {assetCategoryOptions.find(
                    (item) => item.value === (b.asset_category || "office"),
                  )?.label || "기타"}
                </span>
                <ReviewRecordButton
                  entity="buildings"
                  id={b.id}
                  label="자산 정보 수정 / 추가하기"
                  edit
                />
              </div>
              <h1 id={`asset-detail-title-${b.id}`} ref={title} tabIndex={-1}>
                {b.is_igis && (
                  <span
                    className="igis-badge asset-heading-badge"
                    aria-label="이지스 자산"
                  >
                    IGIS
                  </span>
                )}
                <RV entity="buildings" id={b.id} field="name">
                  {b.name}
                </RV>
              </h1>
              <p>
                <MapPin size={13} />
                <span className="asset-address-text">
                  <RV
                    entity="buildings"
                    id={b.id}
                    field={showRoad ? "road_address" : "address"}
                  >
                    {shownAddress}
                  </RV>
                </span>
                <button
                  className="asset-address-switch"
                  type="button"
                  disabled={
                    !parcelAddress ||
                    !roadAddress ||
                    parcelAddress === roadAddress
                  }
                  title={
                    !roadAddress
                      ? "등록된 도로명 주소가 없습니다"
                      : !parcelAddress
                        ? "등록된 지번 주소가 없습니다"
                        : undefined
                  }
                  aria-label={`${showRoad ? "지번" : "도로명"} 주소로 전환`}
                  onClick={() => setAddressMode(showRoad ? "parcel" : "road")}
                >
                  <RotateCw size={13} />
                  {showRoad ? "지번" : "도로명"}
                </button>
              </p>
            </div>
          </div>
          <figure className="asset-photo">
            <AssetMedia
              key={b.id}
              building={b}
              photo={photo}
              photos={photos}
              floorPlans={floorPlans}
              onPhoto={setPhotoId}
              onManageImages={onManageImages}
            />
          </figure>
          <div className="asset-metrics">
            <header className="asset-metrics-toolbar">
              <button
                className="area-unit-toggle"
                onClick={() => setUnit(unit === "평" ? "m²" : "평")}
                aria-label={`모든 면적을 ${unit === "평" ? "제곱미터" : "평"}로 전환`}
                title="상세페이지 전체 면적 단위 전환"
              >
                <RotateCw size={14} /> {unit === "평" ? "m²" : "평"}
              </button>
            </header>
            <div>
              <span>연면적{b.area_basis === "planned" ? " · 계획" : ""}</span>
              <strong>
                <RV entity="buildings" id={b.id} field="gross_area_m2">
                  {formatArea(b.gross_area_m2, "m²", unit === "평" ? 0 : 1)}
                </RV>
              </strong>
            </div>
            <div>
              <span>기준층 전용면적</span>
              <strong>{floorValues("exclusive")}</strong>
            </div>
            <div>
              <span>
                {b.status === "development"
                  ? "소유주·시행주체"
                  : leasesSource.inherited
                    ? "시장 NOC · 단지"
                    : "시장 NOC"}
              </span>
              <strong>
                <RV
                  entity={
                    b.status === "development"
                      ? "development_records"
                      : "leasing_quarters"
                  }
                  id={
                    b.status === "development"
                      ? currentDevelopment?.id
                      : leases.find((l) => l.period === noc?.period)?.id
                  }
                  field={b.status === "development" ? "developer" : "noc"}
                >
                  {b.status === "development"
                    ? developmentSummary?.developer || "—"
                    : noc?.value == null
                      ? "—"
                      : `${(perPyeong(noc.value)! / 10000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}만원/${unit}`}
                </RV>
              </strong>
            </div>
            <div>
              <span>
                {b.status === "development"
                  ? "준공 예정"
                  : !b.completion_year && sharedBuilding?.completion_year
                    ? "준공 · 단지"
                    : "준공"}
              </span>
              <strong>
                <RV
                  entity={
                    b.status === "development"
                      ? "development_records"
                      : "buildings"
                  }
                  id={
                    b.status === "development"
                      ? currentDevelopment?.id
                      : !b.completion_year && sharedBuilding?.completion_year
                        ? sharedBuilding.id
                        : b.id
                  }
                  field={
                    b.status === "development" ? "year" : "completion_year"
                  }
                >
                  {b.status === "development"
                    ? developmentSummary?.completion || "—"
                    : b.completion_year || sharedBuilding?.completion_year
                      ? `${b.completion_year || sharedBuilding?.completion_year}년`
                      : "—"}
                </RV>
              </strong>
            </div>
          </div>
        </div>
        <div className="asset-tabs" role="navigation" aria-label="자산 정보">
          {tabs.map((t, i) => (
            <button
              key={t}
              id={`asset-${b.id}-tab-${i}`}
              aria-current={tab === t ? "location" : undefined}
              aria-controls={`asset-${b.id}-section-${i}`}
              tabIndex={tab === t ? 0 : -1}
              onKeyDown={(e) => {
                if (
                  ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                ) {
                  e.preventDefault();
                  const next =
                    e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? tabs.length - 1
                        : (i +
                            (e.key === "ArrowRight" ? 1 : -1) +
                            tabs.length) %
                          tabs.length;
                  goToSection(tabs[next]);
                  if (tabs[next] === "이지스" && !canReadIgis)
                    onRequireLogin?.();
                  document
                    .getElementById(`asset-${b.id}-tab-${next}`)
                    ?.focus({ preventScroll: true });
                }
              }}
              onClick={() => {
                goToSection(t);
                if (t === "이지스" && !canReadIgis) onRequireLogin?.();
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="asset-body">
          {tabs.map((name, index) => (
            <section
              key={name}
              id={`asset-${b.id}-section-${index}`}
              data-asset-section={name}
              className="asset-scroll-section"
              aria-labelledby={`asset-${b.id}-tab-${index}`}
            >
              {loadedSections.includes(name) ? (
                sectionContent[name]
              ) : (
                <div className="asset-section-placeholder" role="status">
                  {name} 정보를 준비하고 있습니다.
                </div>
              )}
            </section>
          ))}
          <div className="asset-sources-footer">
            <button
              type="button"
              className="asset-sources-toggle"
              aria-expanded={sourcesOpen}
              aria-controls="asset-sources-content"
              onClick={() => setSourcesOpen((open) => !open)}
            >
              <FileText size={16} /> 자료 기준·출처 보기{" "}
              <ChevronRight
                size={16}
                className={sourcesOpen ? "is-open" : ""}
              />
            </button>
            {sourcesOpen && (
              <div id="asset-sources-content">
                {sectionContent["자료 출처"]}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
