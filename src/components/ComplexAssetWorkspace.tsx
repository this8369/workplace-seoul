import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Building2, RotateCw, X } from "lucide-react";
import type { AssetFact } from "../lib/asset-context";
import type { Building } from "../lib/domain";
import { safeSourceUrl } from "../lib/domain";
import type { BuildingComplex, BuildingTower } from "../lib/building-towers";
import { supabase } from "../lib/supabase";
import MemberAssetWorkspace, {
  type MemberWorkspaceProps,
} from "./MemberAssetWorkspace";
import { AreaUnitProvider, useAreaUnit } from "./AreaUnit";
import { DataReviewProvider, ReviewValue as RV } from "./DataReview";
import "./ComplexAssetWorkspace.css";

type ComplexData = {
  complex: BuildingComplex;
  towers: BuildingTower[];
  members: Building[];
  facts: AssetFact[];
};
export default function ComplexAssetWorkspace(
  props: MemberWorkspaceProps & { complex: BuildingComplex },
) {
  return (
    <AreaUnitProvider>
      <ComplexContent {...props} />
    </AreaUnitProvider>
  );
}
function ComplexContent(
  props: MemberWorkspaceProps & { complex: BuildingComplex },
) {
  const [data, setData] = useState<ComplexData>();
  const [failed, setFailed] = useState(false),
    [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState(0);
  const [mobile, setMobile] = useState(
    () => window.matchMedia("(max-width: 900px)").matches,
  );
  const track = useRef<HTMLDivElement>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const { unit, setUnit, formatArea } = useAreaUnit();
  const c = data?.complex || props.complex;
  const components =
    data?.towers.filter(
      (t) => t.component_kind !== "facility" && !t.parent_tower_id,
    ) || [];
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const listener = () => setMobile(mq.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement;
    heading.current?.focus({ preventScroll: true });
    return () => {
      if (prior?.isConnected) prior.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    let alive = true;
    setFailed(false);
    async function load() {
      if (!supabase) throw new Error("not-configured");
      const [a, b, d, f] = await Promise.all([
        supabase
          .from("building_complexes")
          .select("*")
          .eq("id", props.complex.id)
          .single(),
        supabase
          .from("building_towers")
          .select("*")
          .eq("complex_id", props.complex.id)
          .order("sort_order"),
        supabase
          .from("buildings")
          .select("*")
          .eq("complex_id", props.complex.id)
          .order("name"),
        supabase
          .from("building_facts")
          .select("*")
          .eq("complex_id", props.complex.id)
          .order("id"),
      ]);
      if (a.error || b.error || d.error || f.error)
        throw a.error || b.error || d.error || f.error;
      if (alive) {
        setData({
          complex: a.data,
          towers: b.data,
          members: d.data,
          facts: f.data,
        });
      }
    }
    void load().catch(() => {
      if (alive) setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [props.complex.id, revision]);
  useEffect(() => {
    if (!data) return;
    const i = components.findIndex((t) => t.building_id === props.building.id);
    setSelected(Math.max(0, i));
  }, [data?.complex.id]);
  useEffect(() => {
    if (mobile && track.current)
      track.current.scrollTo({
        left: selected * track.current.clientWidth,
        behavior: "instant",
      });
  }, [mobile, data?.complex.id]);
  function choose(i: number) {
    const next = Math.max(0, Math.min(components.length - 1, i));
    setSelected(next);
    if (mobile)
      requestAnimationFrame(() =>
        track.current?.scrollTo({
          left: next * (track.current?.clientWidth || 0),
          behavior: "smooth",
        }),
      );
  }
  const childProps = (b: Building): MemberWorkspaceProps => ({
    ...props,
    building: { ...b, region: b.region || props.building.region },
    single: true,
    embedded: true,
    sharedOverview: data ? (
      <SharedComplexDetails
        data={data}
        assetId={b.id}
        onSaved={() => setRevision((n) => n + 1)}
      />
    ) : undefined,
    complexes: undefined,
    saved:
      props.savedIds?.has(b.id) ?? (b.id === props.building.id && props.saved),
    onSave: () =>
      props.onSaveBuilding ? props.onSaveBuilding(b.id) : props.onSave(),
    onManageImages: props.onManageBuildingImages
      ? () => props.onManageBuildingImages!(b.id)
      : b.id === props.building.id
        ? props.onManageImages
        : undefined,
  });
  return (
    <div
      className={`asset-popup complex-workspace${!data ? " is-loading" : ""}${components.length > 3 ? " has-many-components" : ""}`}
      style={
        {
          "--complex-columns": Math.max(1, components.length),
          "--complex-width": `${Math.max(1, components.length) * 440 + Math.max(0, components.length - 1) * 18}px`,
        } as CSSProperties
      }
      role="dialog"
      aria-modal="false"
      aria-labelledby="complex-title"
      onKeyDown={(e) => {
        if (
          e.key === "Escape" &&
          !e.defaultPrevented &&
          !(e.target as HTMLElement).closest("dialog")
        ) {
          e.stopPropagation();
          props.onClose();
        }
      }}
    >
      <header className="complex-heading">
        <div>
          <span className="complex-kicker">자산 단지</span>
          <h1 id="complex-title" ref={heading} tabIndex={-1}>
            {c.name}
          </h1>
        </div>
        <button
          className="asset-popup-close"
          aria-label="단지 상세 닫기"
          onClick={props.onClose}
        >
          <X size={21} />
        </button>
      </header>
      <div className="complex-navigation">
        <div className="complex-tabs" role="tablist" aria-label="동 선택">
          {components.map((t, i) => (
            <button
              key={t.id}
              id={`tower-tab-${t.id}`}
              role="tab"
              aria-selected={selected === i}
              aria-controls={`tower-panel-${t.id}`}
              tabIndex={selected === i ? 0 : -1}
              onClick={() => choose(i)}
              onKeyDown={(e) => {
                const next =
                  e.key === "ArrowRight"
                    ? i + 1
                    : e.key === "ArrowLeft"
                      ? i - 1
                      : e.key === "Home"
                        ? 0
                        : e.key === "End"
                          ? components.length - 1
                          : null;
                if (next !== null) {
                  e.preventDefault();
                  choose(next);
                  document
                    .getElementById(
                      `tower-tab-${components[Math.max(0, Math.min(components.length - 1, next))].id}`,
                    )
                    ?.focus();
                }
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          className="complex-unit"
          onClick={() => setUnit(unit === "평" ? "m²" : "평")}
          aria-label="면적 단위 전환"
        >
          <RotateCw size={14} />
          {unit === "평" ? "m²" : "평"}
        </button>
      </div>
      {!data ? (
        <div className="empty" role="status">
          <p>
            {failed
              ? "단지 정보를 불러오지 못했습니다."
              : "동별 정보를 불러오고 있습니다."}
          </p>
          {failed && (
            <button onClick={() => setRevision((n) => n + 1)}>다시 시도</button>
          )}
        </div>
      ) : (
        <>
          <>
            <div className="complex-comparison-note">
              <span>
                {mobile
                  ? `${selected + 1} / ${components.length} · 좌우로 밀어 동 전환`
                  : `동별 비교 · ${components.map((t) => t.label).join(" / ")}`}
              </span>
            </div>
            <div
              className="complex-track"
              ref={track}
              onScroll={() => {
                if (mobile && track.current) {
                  const i = Math.round(
                    track.current.scrollLeft / track.current.clientWidth,
                  );
                  if (i >= 0 && i < components.length) setSelected(i);
                }
              }}
            >
              {components.map((t) => {
                const b = t.building_id
                  ? data.members.find((b) => b.id === t.building_id)
                  : undefined;
                return (
                  <section
                    key={t.id}
                    id={`tower-panel-${t.id}`}
                    role="tabpanel"
                    aria-labelledby={`tower-tab-${t.id}`}
                    className="complex-component"
                  >
                    {b ? (
                      <MemberAssetWorkspace {...childProps(b)} />
                    ) : (
                      <DataReviewProvider
                        assetId={props.building.id}
                        onSaved={() => setRevision((n) => n + 1)}
                      >
                        <TowerDetail
                          onClose={props.onClose}
                          tower={t}
                          sharedOverview={
                            <SharedComplexDetails
                              data={data}
                              assetId={props.building.id}
                              onSaved={() => setRevision((n) => n + 1)}
                            />
                          }
                        />
                      </DataReviewProvider>
                    )}
                  </section>
                );
              })}
              {!components.length && (
                <div className="empty">
                  <p>비교할 동 정보가 없습니다.</p>
                  <SharedComplexDetails
                    data={data}
                    assetId={props.building.id}
                    onSaved={() => setRevision((n) => n + 1)}
                  />
                </div>
              )}
            </div>
          </>
        </>
      )}
    </div>
  );
}
function TowerDetail({
  onClose,
  tower: t,
  sharedOverview,
}: {
  tower: BuildingTower;
  onClose: () => void;
  sharedOverview: React.ReactNode;
}) {
  const { formatArea } = useAreaUnit();
  const rows: [string, string, string][] = [
    ["연면적", "gross_area_m2", formatArea(t.gross_area_m2)],
    ["전용면적", "net_area_m2", formatArea(t.net_area_m2)],
    [
      "기준층면적(전용)",
      "typical_floor_exclusive_pyeong",
      formatArea(t.typical_floor_exclusive_pyeong, "평"),
    ],
    [
      "기준층면적(임대)",
      "typical_floor_rentable_pyeong",
      formatArea(t.typical_floor_rentable_pyeong, "평"),
    ],
    [
      "지상 층수",
      "floors_above",
      t.floors_above == null ? "미확인" : `${t.floors_above}층`,
    ],
    [
      "지하 층수",
      "floors_below",
      t.floors_below == null ? "미확인" : `${t.floors_below}층`,
    ],
    [
      "주차대수",
      "parking_spaces",
      t.parking_spaces == null ? "미확인" : `${t.parking_spaces}대`,
    ],
    [
      "계약수전량",
      "contracted_capacity_mw",
      t.contracted_capacity_mw == null
        ? "미확인"
        : `${t.contracted_capacity_mw} MW`,
    ],
  ];
  return (
    <>
      <div className="asset-popup-toolbar complex-unlinked-toolbar">
        <button
          className="asset-popup-close"
          onClick={onClose}
          aria-label="상세 닫기"
        >
          <X size={21} />
        </button>
      </div>
      <div className="complex-tower-detail">
        <div className="complex-tower-hero">
          <Building2 size={32} />
          <h3>{t.label}</h3>
          <p>{t.main_use || "동별 자산 정보"}</p>
          {t.overview && <p>{t.overview}</p>}
        </div>
        <section className="complex-overview-card">
          <h2>자산 개요</h2>
          <dl>
            {rows.map(([label, field, value]) => (
              <div key={field}>
                <dt>{label}</dt>
                <dd>
                  <RV entity="building_towers" id={t.id} field={field}>
                    {value}
                  </RV>
                </dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="complex-overview-card">
          <h2>시장 임대</h2>
          <p className="context-note">
            이 동에 연결된 시장 임대 자료가 아직 없습니다.
          </p>
        </section>
        {sharedOverview}
        <details className="complex-sources">
          <summary>자료 기준·출처 보기</summary>
          <p>{t.evidence?.source_name || "동별 등록 자료"}</p>
          {safeSourceUrl(t.evidence?.source_url || t.source_url || null) && (
            <a
              href={safeSourceUrl(
                t.evidence?.source_url || t.source_url || null,
              )}
              target="_blank"
              rel="noreferrer"
            >
              원문 보기
            </a>
          )}
        </details>
      </div>
    </>
  );
}

function SharedComplexDetails({
  data,
  assetId,
  onSaved,
}: {
  data: ComplexData;
  assetId: string;
  onSaved: () => void;
}) {
  const c = data.complex;
  const { formatArea } = useAreaUnit();
  const components = data.towers.filter(
    (t) => t.component_kind !== "facility" && !t.parent_tower_id,
  );
  const facilities = data.towers.filter((t) => t.component_kind === "facility");
  // Keep one stable editable source row per shared field. Historical copies
  // stay intact; changing the displayed value must not create a second row.
  const sharedFacts = [...data.facts].sort(
    (a, b) =>
      Number(b.building_id === c.representative_building_id) -
        Number(a.building_id === c.representative_building_id) ||
      a.id.localeCompare(b.id),
  );
  const commonFacts = sharedFacts.filter(
    (f, i, all) =>
      !/연면적|GFA|기준층/.test(f.field_key) &&
      all.findIndex(
        (x) =>
          x.field_key === f.field_key &&
          x.unit === f.unit &&
          x.source_name === f.source_name,
      ) === i,
  );
  return (
    <div className="complex-shared-overview">
      <DataReviewProvider assetId={assetId} onSaved={onSaved}>
        <section className="complex-overview-card">
          <div className="complex-card-heading">
            <h2>단지 공용시설</h2>
            <Building2 size={20} />
          </div>
          <dl>
            <div>
              <dt>구성</dt>
              <dd>{components.map((t) => t.label).join(" · ")}</dd>
            </div>
            <div>
              <dt>공용 주차대수</dt>
              <dd>
                <RV
                  entity="building_complexes"
                  id={c.id}
                  field="parking_spaces"
                >
                  {c.parking_spaces == null
                    ? "미확인"
                    : `${c.parking_spaces.toLocaleString()}대`}
                </RV>
              </dd>
            </div>
            <div>
              <dt>단지 계약수전량</dt>
              <dd>
                <RV
                  entity="building_complexes"
                  id={c.id}
                  field="contracted_capacity_mw"
                >
                  {c.contracted_capacity_mw == null
                    ? "미확인"
                    : `${c.contracted_capacity_mw} MW`}
                </RV>
              </dd>
            </div>
          </dl>
        </section>
        {!!facilities.length && (
          <section className="complex-overview-card">
            <h2>공용·부대시설</h2>
            <div className="complex-facilities">
              {facilities.map((t) => (
                <div key={t.id}>
                  <div>
                    <strong>{t.label}</strong>
                    <span>{t.main_use || "공용 시설"}</span>
                  </div>
                  <b>{formatArea(t.gross_area_m2)}</b>
                </div>
              ))}
            </div>
          </section>
        )}
        {!!c.common_facts?.filter(
          (f) => !/연면적|기준층|기존 계획|참고자료/.test(f.label),
        ).length && (
          <section className="complex-overview-card">
            <h2>공통 자산 정보</h2>
            <dl>
              {c.common_facts
                .filter(
                  (f) => !/연면적|기준층|기존 계획|참고자료/.test(f.label),
                )
                .map((f, i) => (
                  <div key={i}>
                    <dt>{f.label}</dt>
                    <dd>{f.value}</dd>
                  </div>
                ))}
            </dl>
          </section>
        )}
        {!!commonFacts.length && (
          <section className="complex-overview-card">
            <h2>공통 시설·운영 정보</h2>
            <dl>
              {commonFacts.map((f) => (
                <div key={f.id}>
                  <dt>{f.field_key.replace(/^.*? 전체 · /, "")}</dt>
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
      </DataReviewProvider>
    </div>
  );
}
