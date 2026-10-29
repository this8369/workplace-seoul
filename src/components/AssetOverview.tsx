import { hasAssetValue, overviewFields } from "../lib/shared-asset";
import { useEffect, useId, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronUp,
  Leaf,
  TrainFront,
  Zap,
  Plus,
  ShieldCheck,
  ArrowUpRight,
} from "lucide-react";
import { assetDetailClient as supabase } from "../lib/asset-detail-client";
import type { BuildingComplex } from "../lib/building-towers";
import type { Building } from "../lib/domain";
import { safeSourceUrl } from "../lib/domain";
import type { Place } from "../lib/asset-context";
import type { RegisterData } from "../lib/building-register";
import {
  certificateStates,
  certificateState,
  lineColors,
  loadDensity,
  nearbyStations,
  overviewRegisterFact,
  type AssetProfile,
  type PowerSpec,
  type CertificationOption,
} from "../lib/asset-overview";
import {
  ReviewValue as RV,
  ReviewRecordButton,
  useDataReviewVersion,
} from "./DataReview";
import { useAreaUnit } from "./AreaUnit";
import "./AssetOverview.css";
import LoadDensityHelp from "./LoadDensityHelp";
export function LineBadges({ lines }: { lines: string[] }) {
  return (
    <span className="overview-lines">
      {lines.map((l) => (
        <span
          className="overview-line"
          style={{ background: lineColors[l] || "#617187" }}
          key={l}
          title={l}
          aria-label={l}
        >
          {l.replace("호선", "")}
        </span>
      ))}
    </span>
  );
}
const scalar = (n: number | null | undefined, unit = "") =>
  n == null
    ? "미확인"
    : `${Number(n).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}${unit}`;
const previewLabels = new Set([
  "소유주",
  "대지면적",
  "연면적",
  "용적률",
  "전용률",
  "규모",
]);
export default function AssetOverview({
  building: b,
  floorValues,
  places,
  contractor,
  register,
  sharedBuilding,
  sharedRegister,
  complex,
}: {
  building: Building;
  complex?: BuildingComplex;
  sharedBuilding?: Building;
  sharedRegister?: RegisterData | null;
  floorValues: (kind: "rentable" | "exclusive") => ReactNode;
  places: Place[];
  contractor?: string | null;
  register?: RegisterData | null;
}) {
  const version = useDataReviewVersion(),
    { formatArea } = useAreaUnit();
  const [expanded, setExpanded] = useState(false);
  const factsId = useId();
  useEffect(() => setExpanded(false), [b.id]);
  const [data, setData] = useState<{
      id: string;
      profile: AssetProfile;
      power: PowerSpec;
      options: CertificationOption[];
      sharedProfile?: AssetProfile;
      sharedPower?: PowerSpec;
      green: {
        id: string;
        name: string;
        area_m2: number;
        distance_m: number;
        source_url: string;
      }[];
    } | null>(null),
    [error, setError] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setError(false);
    if (!supabase) {
      setError(true);
      return;
    }
    void Promise.all([
      supabase
        .from("building_asset_profiles")
        .select("*")
        .eq("id", b.id)
        .single(),
      supabase.from("building_power_specs").select("*").eq("id", b.id).single(),
      supabase
        .from("asset_certification_options")
        .select("*")
        .order("sort_order"),
      supabase
        .from("building_green_spaces")
        .select("*")
        .eq("building_id", sharedBuilding?.id || b.id)
        .order("distance_m"),
      sharedBuilding
        ? supabase
            .from("building_asset_profiles")
            .select("*")
            .eq("id", sharedBuilding.id)
            .single()
        : Promise.resolve({ data: null, error: null }),
      sharedBuilding
        ? supabase
            .from("building_power_specs")
            .select("*")
            .eq("id", sharedBuilding.id)
            .single()
        : Promise.resolve({ data: null, error: null }),
    ])
      .then(([profile, power, options, green, sharedProfile, sharedPower]) => {
        if (!live) return;
        if (
          profile.error ||
          power.error ||
          options.error ||
          green.error ||
          sharedProfile.error ||
          sharedPower.error
        ) {
          setError(true);
          return;
        }
        setData({
          id: b.id,
          profile: profile.data,
          sharedProfile: sharedProfile.data || undefined,
          sharedPower: sharedPower.data || undefined,
          power: power.data,
          options: options.data,
          green: green.data || [],
        });
      })
      .catch(() => {
        if (live) setError(true);
      });
    return () => {
      live = false;
    };
  }, [b.id, sharedBuilding?.id, version, attempt]);
  const current = data?.id === b.id ? data : null;
  const profileFields = overviewFields(
    current?.profile,
    current?.sharedProfile,
    [
      "owner_name",
      "site_area_m2",
      "floor_area_ratio",
      "efficiency_pct",
      "retail_area_m2",
      "retail_area_basis",
      "contractor_name",
      "architect_name",
      "views",
      "green_spaces",
      "hotels",
      "amenity_operators",
      "retail_operators",
      "subway_connections",
      "certifications",
    ],
  );
  const powerFields = overviewFields(current?.power, current?.sharedPower, [
    "contracted_capacity_mw",
    "dual_substation",
  ]);
  const buildingFields = overviewFields(b, sharedBuilding, ["overview"]);
  const p = profileFields.values,
    power = complex || powerFields.values,
    displayedBuilding = buildingFields.values || b;
  // Area bases belong to the same observation as their corresponding area.
  if (p && current?.sharedProfile)
    for (const prefix of ["office", "retail"] as const) {
      if (profileFields.inherited.has(`${prefix}_area_m2`)) {
        p[`${prefix}_area_basis`] =
          current.sharedProfile[`${prefix}_area_basis`];
        profileFields.inherited.add(`${prefix}_area_basis`);
      }
    }
  const sourceId = (field: string, entity = "building_asset_profiles") =>
    entity === "building_power_specs"
      ? complex?.id || powerFields.sourceId(field as keyof PowerSpec)
      : entity === "buildings"
        ? buildingFields.sourceId(field as keyof Building)
        : profileFields.sourceId(field as keyof AssetProfile);
  const ownOfficial = (field: string) =>
    overviewRegisterFact(
      b.area_basis === "planned" ? [] : register?.records || [],
      field,
    );
  const official = (field: string) => {
    if (field === "floors_above" || field === "floors_below")
      return b[field] == null ? ownOfficial(field) : null;
    // A tower's GFA must never fall back to the complex or its total register.
    if (field === "gross_area_m2") return complex ? null : ownOfficial(field);
    if (complex && field === "parking_total") return null;
    const profileValue = (
      p as unknown as Record<string, unknown> | undefined
    )?.[field];
    if (hasAssetValue(profileValue)) return null;
    return overviewRegisterFact(
      b.area_basis === "planned"
        ? []
        : (sharedBuilding ? sharedRegister : register)?.records || [],
      field,
    );
  };
  const officialValue = (
    field: string,
    fallback: ReactNode,
    format: (value: number) => ReactNode,
  ) => {
    const fact = official(field);
    if (!fact) return fallback;
    const key = field === "parking_total" ? "parking_spaces" : field;
    const entity = [
      "floors_above",
      "floors_below",
      "gross_area_m2",
      "parking_spaces",
    ].includes(key)
      ? "buildings"
      : "building_asset_profiles";
    // Registry remains immutable evidence. A user correction is an editable
    // overview override at the same common/component scope as other values.
    return edit(key, format(Number(fact.value)), entity);
  };

  const edit = (
    field: string,
    content: ReactNode,
    entity = "building_asset_profiles",
  ) => (
    <span className="overview-scoped-value">
      <RV
        entity={
          entity === "building_power_specs" && complex
            ? "building_complexes"
            : entity
        }
        id={current ? sourceId(field, entity) : null}
        field={field}
        allowedFields={[field]}
      >
        {content}
      </RV>
    </span>
  );
  const row = (
    label: string,
    content: ReactNode,
    sub?: ReactNode,
    collapsible = false,
  ) => (
    <div
      className="overview-fact"
      key={label}
      hidden={collapsible && !expanded && !previewLabels.has(label)}
    >
      <dt>{label}</dt>
      <dd>
        {content}
        {sub && <small>{sub}</small>}
      </dd>
    </div>
  );
  const overviewRow = (label: string, content: ReactNode, sub?: ReactNode) =>
    row(label, content, sub, true);
  const tags = (
    field:
      | "views"
      | "green_spaces"
      | "hotels"
      | "amenity_operators"
      | "retail_operators",
  ) =>
    edit(
      field,
      p?.[field]?.length ? (
        <span className="overview-tags">
          {p[field].map((n) => (
            <span key={n}>{n}</span>
          ))}
        </span>
      ) : (
        <span className="overview-missing">
          {field === "green_spaces" && current?.green.length
            ? "정보 추가"
            : "미등록"}{" "}
          <Plus size={12} />
        </span>
      ),
    );
  const stations = nearbyStations(places),
    density = loadDensity(
      power?.contracted_capacity_mw,
      Number(
        complex
          ? complex.gross_area_m2
          : official("gross_area_m2")?.value || b.gross_area_m2,
      ),
    );
  const greenCandidates = current?.green || [];
  return (
    <div className="asset-overview-stack">
      <section className="info-panel asset-overview-card">
        <div className="section-heading">
          <h2>자산 개요</h2>
          <button
            type="button"
            className="overview-toggle"
            aria-expanded={expanded}
            aria-controls={factsId}
            aria-label={`자산개요 ${expanded ? "접기" : "펼치기"}`}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "접기" : "펼치기"}
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
        {error ? (
          <p className="overview-load-error" role="alert">
            추가 정보를 불러오지 못했습니다.{" "}
            <button onClick={() => setAttempt((n) => n + 1)}>
              다시 불러오기
            </button>
          </p>
        ) : (
          !current && (
            <p role="status" className="overview-loading">
              자산 정보를 불러오는 중입니다.
            </p>
          )
        )}
        {expanded && displayedBuilding.overview && (
          <p className="context-note">
            <RV
              entity="buildings"
              id={buildingFields.sourceId("overview")}
              field="overview"
              allowedFields={["overview"]}
            >
              {displayedBuilding.overview}
            </RV>
          </p>
        )}
        <dl className="overview-facts" id={factsId}>
          {overviewRow("소유주", edit("owner_name", p?.owner_name || "미확인"))}
          {overviewRow(
            "대지면적",
            officialValue(
              "site_area_m2",
              edit("site_area_m2", formatArea(p?.site_area_m2)),
              (v) => formatArea(v),
            ),
          )}
          {overviewRow(
            "연면적",
            edit("gross_area_m2", formatArea(b.gross_area_m2), "buildings"),
          )}
          {overviewRow(
            "용적률",
            officialValue(
              "floor_area_ratio",
              edit("floor_area_ratio", scalar(p?.floor_area_ratio, "%")),
              (v) => scalar(v, "%"),
            ),
          )}
          {overviewRow(
            "전용률",
            edit("efficiency_pct", scalar(p?.efficiency_pct, "%")),
          )}
          {overviewRow(
            "규모",
            <span>
              {officialValue(
                "floors_below",
                edit(
                  "floors_below",
                  displayedBuilding.floors_below == null
                    ? "지하 미확인"
                    : `B${displayedBuilding.floors_below}`,
                  "buildings",
                ),
                (v) => `B${v}`,
              )}{" "}
              /{" "}
              {officialValue(
                "floors_above",
                edit(
                  "floors_above",
                  displayedBuilding.floors_above == null
                    ? "지상 미확인"
                    : `${displayedBuilding.floors_above}F`,
                  "buildings",
                ),
                (v) => `${v}F`,
              )}
            </span>,
          )}
          {overviewRow(
            "천정고",
            edit("ceiling_height_m", scalar(p?.ceiling_height_m, "m")),
          )}
          {overviewRow(
            "Lease Span",
            edit("lease_span_m", scalar(p?.lease_span_m, "m")),
          )}
          {overviewRow(
            "주차대수",
            officialValue(
              "parking_total",
              complex ? (
                <RV
                  entity="building_complexes"
                  id={complex.id}
                  field="parking_spaces"
                  allowedFields={["parking_spaces"]}
                >
                  {scalar(complex.parking_spaces, "대")}
                </RV>
              ) : (
                edit(
                  "parking_spaces",
                  scalar(b.parking_spaces, "대"),
                  "buildings",
                )
              ),
              (v) => scalar(v, "대"),
            ),
          )}
          {overviewRow(
            "오피스면적",
            edit("office_area_m2", formatArea(p?.office_area_m2)),
          )}
          {overviewRow(
            "리테일면적",
            edit("retail_area_m2", formatArea(p?.retail_area_m2)),
          )}
          {overviewRow("기준층면적(전용)", floorValues("exclusive"))}
          {overviewRow("기준층면적(임대)", floorValues("rentable"))}
          {overviewRow(
            "시공사",
            edit(
              "contractor_name",
              p?.contractor_name || contractor || "미확인",
            ),
          )}
          {overviewRow(
            "설계사",
            edit("architect_name", p?.architect_name || "미확인"),
          )}
          {overviewRow(
            "지하철 직연결",
            edit(
              "subway_connections",
              p?.subway_connections.length ? (
                <span className="overview-connections">
                  {p.subway_connections.map((c, i) => (
                    <span key={i}>
                      <LineBadges lines={c.lines} />
                      {c.station_name}
                      <small>
                        {c.direct_connection == null
                          ? "미확인"
                          : c.direct_connection
                            ? "직연결 O"
                            : "직연결 X"}
                      </small>
                    </span>
                  ))}
                </span>
              ) : (
                <span className="overview-missing">
                  미확인 <Plus size={12} />
                </span>
              ),
            ),
          )}
          {stations.length > 0 &&
            overviewRow(
              "인근 역 · 500m",
              <span className="overview-connections">
                {stations.map((s) => (
                  <span key={s.id}>
                    <LineBadges lines={s.lines} />
                    {!s.lines.length && <TrainFront size={13} />}
                    <span>{s.name}</span>
                    <small>{Math.round(Number(s.distance_m))}m</small>
                  </span>
                ))}
              </span>,
            )}
          {overviewRow("VIEW", tags("views"))}
          {overviewRow(
            "자연환경",
            tags("green_spaces"),
            greenCandidates.length ? (
              <span
                className="overview-green-nearby"
                title="공원 기준점 반경 500m · 공원 경계까지 거리와 다릅니다."
              >
                500m 이내{" "}
                {greenCandidates
                  .map((x) => `${x.name} ${Math.round(x.distance_m)}m`)
                  .join(" · ")}
              </span>
            ) : undefined,
          )}
          {overviewRow("호텔", tags("hotels"))}
          {overviewRow("어메니티 운영사", tags("amenity_operators"))}
          {overviewRow("브랜드 리테일 운영사", tags("retail_operators"))}
        </dl>
      </section>
      <section className="info-panel asset-power-card">
        <div className="section-heading">
          <h2>전력</h2>
          <Zap size={19} />
        </div>
        <div className="overview-power-metrics">
          <div>
            <span>자산계약수전량</span>
            <strong>
              {edit(
                "contracted_capacity_mw",
                power?.contracted_capacity_mw == null ? (
                  "미확인"
                ) : (
                  <>
                    {scalar(power.contracted_capacity_mw)}
                    <small>MW</small>
                  </>
                ),
                "building_power_specs",
              )}
            </strong>
          </div>
          <div>
            <span>
              평당부하밀도
              <LoadDensityHelp />
            </span>
            <strong>
              {density == null ? (
                "미확인"
              ) : (
                <>
                  {scalar(density)}
                  <small>W/평</small>
                </>
              )}
            </strong>
          </div>
        </div>
        <dl className="overview-facts">
          {row(
            "이중변전소",
            edit(
              "dual_substation",
              power?.dual_substation == null ? (
                "미확인"
              ) : (
                <span
                  className="overview-dual-substation"
                  aria-label={
                    power.dual_substation
                      ? "이중변전소 있음"
                      : "이중변전소 없음"
                  }
                >
                  {power.dual_substation ? "O" : "X"}
                </span>
              ),
              "building_power_specs",
            ),
          )}
        </dl>
      </section>
      <section className="info-panel asset-certification-card">
        <div className="section-heading">
          <h2>친환경 인증</h2>
          <Leaf size={19} />
        </div>
        {(official("green_grade") || official("energy_grade")) && (
          <dl className="overview-facts">
            {(
              [
                ["green_grade", "친환경건축물등급"],
                ["energy_grade", "에너지효율등급"],
              ] as const
            ).map(([field, label]) => {
              const fact = official(field);
              return fact
                ? row(
                    label,
                    <RV
                      entity="building_register_records"
                      id={fact.record.id}
                      field={field}
                      allowedFields={[field]}
                    >
                      {String(fact.value)}
                    </RV>,
                  )
                : null;
            })}
          </dl>
        )}
        <div className="overview-certificates">
          {p?.certifications.length ? (
            p.certifications.map((c, i) => {
              const option = current?.options.find(
                  (o) => o.code === c.option_code,
                ),
                state = certificateState(c),
                logo = safeSourceUrl(c.logo_url || option?.logo_url || null);
              return (
                <div
                  className={`overview-certification certificate-${state}`}
                  key={i}
                >
                  {logo ? (
                    <img
                      src={logo}
                      alt={`${option?.scheme} ${option?.grade}`}
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.hidden = true;
                      }}
                    />
                  ) : (
                    <div className="overview-certification-symbol">
                      <ShieldCheck size={23} />
                      <span>{option?.scheme || "인증"}</span>
                    </div>
                  )}
                  <div>
                    <strong>
                      {option?.scheme} <span>{option?.grade}</span>
                    </strong>
                    <small>
                      {certificateStates[state]}
                      {c.certified_on ? ` · ${c.certified_on}` : ""}
                    </small>
                    {c.expires_on && <small>유효기간 {c.expires_on}</small>}
                  </div>
                  {safeSourceUrl(c.certificate_url || null) && (
                    <a
                      href={c.certificate_url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="인증서 보기"
                    >
                      <ArrowUpRight size={16} />
                    </a>
                  )}
                </div>
              );
            })
          ) : (
            <div className="overview-certification-empty">
              <Leaf size={24} />
              <span>등록된 인증이 없습니다.</span>
            </div>
          )}
        </div>
        <div className="overview-card-footer">
          <ReviewRecordButton
            entity="building_asset_profiles"
            id={sourceId("certifications")}
            field="certifications"
            allowedFields={["certifications"]}
            label="인증 추가·수정"
            edit
          />
        </div>
      </section>
    </div>
  );
}
