import { useState } from "react";
import {
  ArrowUpRight,
  MapPin,
  School,
  TrainFront,
  Store,
  Layers,
} from "lucide-react";
import { safeSourceUrl, type Building } from "../lib/domain";
import { registerValue, type RegisterData } from "../lib/building-register";
import type { Parcel, Place, Resource } from "../lib/asset-context";
import ParcelMap from "./ParcelMap";

const emptyParcels: Parcel[] = [];
function DataStatus({
  resource,
  onRetry,
  children,
}: {
  resource: Resource<unknown[]>;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  if (resource.error)
    return (
      <div className="context-status" role="alert">
        <span>정보를 불러오지 못했습니다.</span>
        <button onClick={onRetry}>다시 불러오기</button>
      </div>
    );
  if (!resource.data)
    return (
      <div className="context-status" role="status">
        정보를 불러오는 중입니다.
      </div>
    );
  if (!resource.data.length)
    return (
      <div className="context-status">
        <Layers size={19} />
        <span>{children}</span>
        <span className="connection-tag">데이터 연결 전</span>
      </div>
    );
  return null;
}
function Rows({ rows }: { rows: [string, unknown, string?][] }) {
  return (
    <dl>
      {rows.map(([label, value, unit]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>
            {value == null || value === "" ? "—" : registerValue(value, unit)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
function Provenance({
  item,
}: {
  item: {
    source_name: string;
    source_url: string | null;
    as_of: string | null;
  };
}) {
  const url = safeSourceUrl(item.source_url);
  return (
    <p className="context-provenance">
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">
          {item.source_name} <ArrowUpRight size={12} />
        </a>
      ) : (
        item.source_name
      )}
      {item.as_of && ` · ${item.as_of} 기준`}
    </p>
  );
}
export function LandPanel({
  building,
  parcels,
  register,
  onRetry,
}: {
  building: Building;
  parcels: Resource<Parcel[]>;
  register: Resource<RegisterData>;
  onRetry: () => void;
}) {
  const [selection, setSelection] = useState("");
  const rows = parcels.data ?? emptyParcels;
  const parcel =
    rows.find((p) => p.id === selection) ??
    rows.find((p) => p.is_primary) ??
    rows[0];
  const record =
    register.data?.records.find((r) => r.record_kind === "complex") ??
    register.data?.records[0];
  const zoning =
    register.data?.sections.filter((s) => s.section === "zoning") ?? [];
  return (
    <div className="context-panel">
      <div className="section-heading">
        <div>
          <h2>토지와 입지</h2>
          <p>필지 경계와 건축물대장의 대지 정보를 함께 살펴보세요.</p>
        </div>
        <MapPin size={20} />
      </div>
      <ParcelMap building={building} parcels={rows} />
      <DataStatus resource={parcels} onRetry={onRetry}>
        필지 경계·토지 특성·공시지가 자료를 연결하면 이곳에 표시됩니다.
      </DataStatus>
      {rows.length > 0 && !rows.some((p) => p.geometry) && (
        <div className="context-status">
          건축물대장의 대표·부속지번을 연결했습니다. 경계와 토지 속성은 VWorld
          연결 후 표시됩니다.
        </div>
      )}
      {rows.length > 0 && (
        <div className="parcel-picker" aria-label="필지 선택">
          {rows.map((p) => (
            <button
              key={p.id}
              aria-pressed={p.id === parcel?.id}
              onClick={() => setSelection(p.id)}
            >
              {p.address}
              {p.is_primary && <span>대표</span>}
            </button>
          ))}
        </div>
      )}
      <div className="overview-grid">
        <section className="info-panel">
          <h3>토지 기본정보</h3>
          <Rows
            rows={[
              [
                "소재지",
                parcel?.address ?? record?.lot_address ?? building.address,
              ],
              [
                parcel ? "선택 필지 면적" : "대장상 대지면적",
                parcel?.area_m2 ?? (parcel ? null : record?.site_area_m2),
                "㎡",
              ],
              ["지목", parcel?.land_category],
              ["이용상황", parcel?.land_use],
              ["지형·고저", parcel?.terrain],
              ["형상", parcel?.shape],
              ["도로조건", parcel?.road_condition],
              ...(parcel
                ? [
                    ["대장상 대지면적", record?.site_area_m2, "㎡"] as [
                      string,
                      unknown,
                      string,
                    ],
                  ]
                : []),
            ]}
          />
          {parcel ? (
            <Provenance item={parcel} />
          ) : (
            <p className="context-note">
              —는 미연결 항목입니다. 대장상 대지면적과 개별 필지 면적은 다를 수
              있습니다.
            </p>
          )}
        </section>
        <section className="info-panel">
          <h3>소유 구분</h3>
          <Rows
            rows={[
              ["소유 구분", parcel?.ownership_type],
              ["소유권 변동일", parcel?.ownership_changed_on],
              ["공유 인수", parcel?.coowners, "명"],
            ]}
          />
          <p className="context-note">
            토지 공부 기준 정보입니다. 개발사업의 시행주체와 구분됩니다.
          </p>
          <div className="context-links">
            <a href="https://www.eum.go.kr/" target="_blank" rel="noreferrer">
              토지이음 <ArrowUpRight size={13} />
            </a>
            <a href="https://www.gov.kr/" target="_blank" rel="noreferrer">
              토지대장 <ArrowUpRight size={13} />
            </a>
            <a href="https://www.iros.go.kr/" target="_blank" rel="noreferrer">
              등기 열람 <ArrowUpRight size={13} />
            </a>
          </div>
        </section>
      </div>
      <section className="info-panel">
        <div className="section-heading">
          <h3>토지이용계획 · 지역·지구</h3>
          <span className="connection-tag">
            {parcel?.zoning.length
              ? "필지 기준"
              : zoning.length
                ? "건축물대장 기준"
                : "연결 전"}
          </span>
        </div>
        {parcel?.zoning.length ? (
          <div className="zoning-chips">
            {parcel.zoning.map((z, i) => (
              <span key={i}>
                {z.name}
                <small>{z.relation}</small>
              </span>
            ))}
          </div>
        ) : zoning.length ? (
          <div className="zoning-chips">
            {zoning.map((z) => (
              <span key={z.id}>
                {String(z.attributes.name ?? "—")}
                <small>{String(z.attributes.category ?? "")}</small>
              </span>
            ))}
          </div>
        ) : (
          <p className="context-note">
            용도지역·용도지구·행위제한과 포함·접함·저촉 여부를 표시할
            예정입니다.
          </p>
        )}
      </section>
      <section className="info-panel">
        <div className="section-heading">
          <h3>개별공시지가</h3>
          <span className="subtle-label">원/㎡ · 연도별</span>
        </div>
        {parcel?.official_prices.length ? (
          <div className="official-price-list">
            {[...parcel.official_prices]
              .sort((a, b) => b.year - a.year)
              .map((p) => (
                <div key={p.year}>
                  <span>{p.year}년</span>
                  <strong>{p.price_won_m2.toLocaleString("ko-KR")}원/㎡</strong>
                </div>
              ))}
          </div>
        ) : (
          <p className="context-note">
            연도별 공시지가 데이터 연결 전입니다. 시세 추정값은 표시하지
            않습니다.
          </p>
        )}
      </section>
    </div>
  );
}
export function SurroundingsPanel({
  building,
  places,
  onRetry,
}: {
  building: Building;
  places: Resource<Place[]>;
  onRetry: () => void;
}) {
  const [category, setCategory] = useState<Place["category"]>("transit");
  const [radius, setRadius] = useState(1000);
  const filtered = (places.data ?? [])
    .filter(
      (p) =>
        p.category === category &&
        p.distance_m != null &&
        p.distance_m <= radius,
    )
    .sort((a, b) => a.distance_m! - b.distance_m!);
  return (
    <div className="context-panel">
      <div className="section-heading">
        <div>
          <h2>주변 환경</h2>
          <p>{building.address}</p>
        </div>
        <div className="segmented" aria-label="주변 검색 반경">
          {[500, 1000].map((r) => (
            <button
              key={r}
              aria-pressed={radius === r}
              onClick={() => setRadius(r)}
            >
              {r === 1000 ? "1km" : "500m"}
            </button>
          ))}
        </div>
      </div>
      <div className="nearby-categories">
        {(
          [
            ["transit", "대중교통", TrainFront],
            ["education", "교육시설", School],
            ["amenity", "편의시설", Store],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            aria-pressed={category === key}
            onClick={() => setCategory(key)}
          >
            <Icon size={22} />
            <strong>{label}</strong>
            <span>
              {places.data?.length
                ? `${places.data.filter((p) => p.category === key && p.distance_m != null && p.distance_m <= radius).length}곳`
                : "연결 전"}
            </span>
          </button>
        ))}
      </div>
      <DataStatus resource={places} onRetry={onRetry}>
        교통·교육·생활편의시설의 위치와 거리 정보를 준비하고 있습니다.
      </DataStatus>
      {filtered.length ? (
        <div className="nearby-list">
          {filtered.map((p) => (
            <article className="info-panel" key={p.id}>
              <div className="section-heading">
                <h3>{p.name}</h3>
                <strong>{p.distance_m?.toLocaleString("ko-KR")}m</strong>
              </div>
              <p>{p.address}</p>
              <p className="context-note">
                {p.walking_minutes != null && p.walking_source
                  ? `도보 ${p.walking_minutes}분 · ${p.walking_source}`
                  : "직선거리 기준 · 도보 경로 미연결"}
              </p>
              <Provenance item={p} />
            </article>
          ))}
        </div>
      ) : places.data?.length ? (
        <div className="context-status">
          선택한 반경 내에 확인된 시설이 없습니다.
        </div>
      ) : null}
      <section className="info-panel">
        <h3>이곳에서 확인할 정보</h3>
        <div className="nearby-preview">
          <div>
            <TrainFront size={20} />
            <strong>대중교통</strong>
            <p>지하철역 · 버스정류장</p>
          </div>
          <div>
            <School size={20} />
            <strong>교육시설</strong>
            <p>어린이집 · 학교</p>
          </div>
          <div>
            <Store size={20} />
            <strong>생활편의</strong>
            <p>병원 · 은행 · 공공기관 · 상업시설</p>
          </div>
        </div>
        <p className="context-note">
          도보 시간은 실제 보행 경로 데이터가 있는 경우에 표시합니다.
        </p>
      </section>
    </div>
  );
}
