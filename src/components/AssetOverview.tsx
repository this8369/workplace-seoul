import { useEffect, useState, type ReactNode } from "react";
import {
  Building2,
  Leaf,
  TrainFront,
  Zap,
  Plus,
  ShieldCheck,
  ArrowUpRight,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import type { Building } from "../lib/domain";
import { safeSourceUrl } from "../lib/domain";
import type { Place } from "../lib/asset-context";
import type { RegisterData } from "../lib/building-register";
import {
  areaBases,
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
export default function AssetOverview({
  building: b,
  floorValues,
  places,
  contractor,
  register,
}: {
  building: Building;
  floorValues: (kind: "rentable" | "exclusive") => ReactNode;
  places: Place[];
  contractor?: string | null;
  register?: RegisterData | null;
}) {
  const version = useDataReviewVersion(),
    { formatArea } = useAreaUnit();
  const [data, setData] = useState<{
      id: string;
      profile: AssetProfile;
      power: PowerSpec;
      options: CertificationOption[];
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
        .eq("building_id", b.id)
        .order("distance_m"),
    ])
      .then(([profile, power, options, green]) => {
        if (!live) return;
        if (profile.error || power.error || options.error || green.error) {
          setError(true);
          return;
        }
        setData({
          id: b.id,
          profile: profile.data,
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
  }, [b.id, version, attempt]);
  const current = data?.id === b.id ? data : null,
    p = current?.profile,
    power = current?.power;
  const official = (field: string) =>
    overviewRegisterFact(
      b.area_basis === "planned" ? [] : register?.records || [],
      field,
    );
  const officialValue = (
    field: string,
    fallback: ReactNode,
    format: (value: number) => ReactNode,
  ) => {
    const fact = official(field);
    return fact ? (
      <RV entity="building_register_records" id={fact.record.id} field={field}>
        {format(Number(fact.value))}
      </RV>
    ) : (
      fallback
    );
  };
  const edit = (
    field: string,
    content: ReactNode,
    entity = "building_asset_profiles",
  ) => (
    <RV entity={entity} id={current ? b.id : null} field={field}>
      {content}
    </RV>
  );
  const row = (label: string, content: ReactNode, sub?: ReactNode) => (
    <div className="overview-fact" key={label}>
      <dt>{label}</dt>
      <dd>
        {content}
        {sub && <small>{sub}</small>}
      </dd>
    </div>
  );
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
      Number(official("gross_area_m2")?.value || b.gross_area_m2),
    );
  const greenCandidates = current?.green || [];
  return (
    <div className="asset-overview-stack">
      <section className="info-panel asset-overview-card">
        <div className="section-heading">
          <h2>자산 개요</h2>
          <Building2 size={19} />
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
        <dl className="overview-facts">
          {row("소유주", edit("owner_name", p?.owner_name || "미확인"))}
          {row(
            "대지면적",
            officialValue(
              "site_area_m2",
              edit("site_area_m2", formatArea(p?.site_area_m2)),
              (v) => formatArea(v),
            ),
          )}
          {row(
            "연면적",
            officialValue(
              "gross_area_m2",
              edit("gross_area_m2", formatArea(b.gross_area_m2), "buildings"),
              (v) => formatArea(v),
            ),
          )}
          {row(
            "용적률",
            officialValue(
              "floor_area_ratio",
              edit("floor_area_ratio", scalar(p?.floor_area_ratio, "%")),
              (v) => scalar(v, "%"),
            ),
          )}
          {row(
            "전용률",
            edit("efficiency_pct", scalar(p?.efficiency_pct, "%")),
          )}
          {row(
            "규모",
            <span>
              {officialValue(
                "floors_below",
                edit(
                  "floors_below",
                  b.floors_below == null ? "지하 미확인" : `B${b.floors_below}`,
                  "buildings",
                ),
                (v) => `B${v}`,
              )}{" "}
              /{" "}
              {officialValue(
                "floors_above",
                edit(
                  "floors_above",
                  b.floors_above == null ? "지상 미확인" : `${b.floors_above}F`,
                  "buildings",
                ),
                (v) => `${v}F`,
              )}
            </span>,
          )}
          {row(
            "천정고",
            edit("ceiling_height_m", scalar(p?.ceiling_height_m, "m")),
          )}
          {row(
            "Lease Span",
            edit("lease_span_m", scalar(p?.lease_span_m, "m")),
          )}
          {row(
            "주차대수",
            officialValue(
              "parking_total",
              edit(
                "parking_spaces",
                scalar(b.parking_spaces, "대"),
                "buildings",
              ),
              (v) => scalar(v, "대"),
            ),
          )}
          {row(
            "오피스면적",
            edit("office_area_m2", formatArea(p?.office_area_m2)),
            p?.office_area_m2 != null
              ? edit("office_area_basis", areaBases[p.office_area_basis])
              : undefined,
          )}
          {row(
            "리테일면적",
            edit("retail_area_m2", formatArea(p?.retail_area_m2)),
            p?.retail_area_m2 != null
              ? edit("retail_area_basis", areaBases[p.retail_area_basis])
              : undefined,
          )}
          {row("기준층면적(전용)", floorValues("exclusive"))}
          {row("기준층면적(임대)", floorValues("rentable"))}
          {row(
            "시공사",
            edit(
              "contractor_name",
              p?.contractor_name || contractor || "미확인",
            ),
          )}
          {row("설계사", edit("architect_name", p?.architect_name || "미확인"))}
          {row(
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
            row(
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
          {row("VIEW", tags("views"))}
          {row(
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
          {row("호텔", tags("hotels"))}
          {row("어메니티 운영사", tags("amenity_operators"))}
          {row("브랜드 리테일 운영사", tags("retail_operators"))}
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
            id={b.id}
            field="certifications"
            label="인증 추가·수정"
            edit
          />
        </div>
      </section>
    </div>
  );
}
