import { useEffect, useRef, useState, type CSSProperties } from "react";
import { RotateCw, X } from "lucide-react";
import type { Building } from "../lib/domain";
import { safeSourceUrl } from "../lib/domain";
import type { BuildingComplex, BuildingTower } from "../lib/building-towers";
import { assetDetailClient as supabase } from "../lib/asset-detail-client";
import MemberAssetWorkspace, {
  type MemberWorkspaceProps,
} from "./MemberAssetWorkspace";
import { AreaUnitProvider, useAreaUnit } from "./AreaUnit";
import "./ComplexAssetWorkspace.css";

type ComplexData = {
  complex: BuildingComplex;
  towers: BuildingTower[];
  members: Building[];
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
      const [a, b, d] = await Promise.all([
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
      ]);
      if (a.error || b.error || d.error) throw a.error || b.error || d.error;
      if (alive) {
        setData({
          complex: a.data,
          towers: b.data,
          members: d.data,
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
  }, [data?.complex.id, props.building.id]);
  useEffect(() => {
    if (mobile && track.current)
      track.current.scrollTo({
        left:
          Math.max(
            0,
            components.findIndex((t) => t.building_id === props.building.id),
          ) * track.current.clientWidth,
        behavior: "instant",
      });
  }, [mobile, data?.complex.id, props.building.id]);
  function choose(i: number) {
    const next = Math.max(0, Math.min(components.length - 1, i));
    setSelected(next);
    const id = components[next]?.building_id;
    const building = data?.members.find((b) => b.id === id);
    if (building) props.onActiveBuilding?.(building);
    if (mobile)
      requestAnimationFrame(() =>
        track.current?.scrollTo({
          left: next * (track.current?.clientWidth || 0),
          behavior: "instant",
        }),
      );
  }
  const childProps = (b: Building): MemberWorkspaceProps => ({
    ...props,
    building: {
      ...b,
      region: b.region || props.building.region,
      asset_category: b.asset_category ?? props.building.asset_category,
    },
    informationRevision: revision,
    onInformationSaved: () => setRevision((n) => n + 1),
    single: true,
    embedded: true,
    sharedOverview: data ? <SharedComplexDetails data={data} /> : undefined,
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
                  if (i >= 0 && i < components.length && i !== selected) {
                    setSelected(i);
                    const building = data?.members.find(
                      (b) => b.id === components[i]?.building_id,
                    );
                    if (building) props.onActiveBuilding?.(building, true);
                  }
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
                    onPointerDownCapture={() => {
                      if (!mobile && b) props.onActiveBuilding?.(b);
                    }}
                    onFocusCapture={() => {
                      if (!mobile && b) props.onActiveBuilding?.(b);
                    }}
                  >
                    {b ? (
                      <MemberAssetWorkspace {...childProps(b)} />
                    ) : (
                      <div className="empty" role="alert">
                        <p>
                          {c.name} {t.label}의 상세 연결을 불러오지 못했습니다.
                        </p>
                        <button onClick={() => setRevision((n) => n + 1)}>
                          다시 불러오기
                        </button>
                      </div>
                    )}
                  </section>
                );
              })}
              {!components.length && (
                <div className="empty">
                  <p>비교할 동 정보가 없습니다.</p>
                  <SharedComplexDetails data={data} />
                </div>
              )}
            </div>
          </>
        </>
      )}
    </div>
  );
}
function SharedComplexDetails({ data }: { data: ComplexData }) {
  const c = data.complex;
  const { formatArea } = useAreaUnit();
  const facilities = data.towers.filter((t) => t.component_kind === "facility");
  const facts =
    c.common_facts?.filter(
      (f) => !/연면적|기준층|기존 계획|참고자료/.test(f.label),
    ) || [];
  if (!facilities.length && !facts.length) return null;
  return (
    <div className="complex-shared-overview">
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
      {!!facts.length && (
        <section className="complex-overview-card">
          <h2>공통 자산 정보</h2>
          <dl>
            {facts.map((f, i) => (
              <div key={i}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}
