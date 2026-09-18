import type { Leasing } from "../lib/catalog";
import { regionStats } from "../lib/region-stats";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, RefreshCw, X } from "lucide-react";
import { formatArea, type Building } from "../lib/domain";
import {
  districts,
  districtGroups,
  spatialGroups,
  hasLocation,
  type MapGroup,
} from "../lib/map-clusters";
import {
  displayBoundaries as boundaries,
  type DistrictKey,
} from "../lib/map-regions";
export type MapCamera = {
  latitude: number;
  longitude: number;
  zoom: number;
  district?: DistrictKey | null;
};
// The SDK is loaded only from Naver's official endpoint.
declare global {
  interface Window {
    naver?: { maps: any };
    navermap_authFailure?: () => void;
  }
}
let sdkPromise: Promise<any> | undefined;
function loadSdk(): Promise<any> {
  if (window.naver?.maps) return Promise.resolve(window.naver.maps);
  if (sdkPromise) return sdkPromise;
  const key = import.meta.env.VITE_NAVER_MAP_CLIENT_ID;
  if (!key) return Promise.reject(new Error("missing-key"));
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const fail = () => {
      clearTimeout(timer);
      script.remove();
      sdkPromise = undefined;
      reject(new Error("map-load-failed"));
    };
    const timer = setTimeout(fail, 15000);
    window.navermap_authFailure = fail;
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(key)}`;
    script.onerror = fail;
    script.onload = () => {
      clearTimeout(timer);
      if (window.naver?.maps) resolve(window.naver.maps);
      else fail();
    };
    document.head.append(script);
  });
  return sdkPromise;
}
export default function NaverMap({
  buildings,
  leasing,
  selected,
  onSelect,
  camera,
}: {
  buildings: Building[];
  leasing: Leasing[];
  selected: string | null;
  onSelect: (id: string) => void;
  camera: { current: MapCamera | null };
}) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<any>(null),
    sdk = useRef<any>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error" | "missing">(
    import.meta.env.VITE_NAVER_MAP_CLIENT_ID ? "loading" : "missing",
  );
  const [attempt, setAttempt] = useState(0);
  const [viewport, setViewport] = useState(0);
  const [hoveredDistrict, setHoveredDistrict] = useState<DistrictKey | null>(
    null,
  );
  const [tooltipPoint, setTooltipPoint] = useState({ x: 24, y: 100 });
  const stats = useMemo(
    () =>
      hoveredDistrict ? regionStats(buildings, leasing, hoveredDistrict) : null,
    [buildings, leasing, hoveredDistrict],
  );
  const nocText = (value: number | null) =>
    value === null
      ? "미확인"
      : `${Math.round(value).toLocaleString("ko-KR")} 원/평`;
  const [overlap, setOverlap] = useState<string[]>([]);
  const [activeDistrict, setActiveDistrict] = useState<DistrictKey | null>(
    camera.current?.district ?? null,
  );
  const activeDistrictRef = useRef(activeDistrict);
  const focusingDistrict = useRef(false);
  const highlightBoundary = useRef<(key: DistrictKey | null) => void>(() => {});
  const zoom = map.current?.getZoom() ?? camera.current?.zoom ?? 12;
  const overview = zoom <= 12 && !activeDistrict;
  const missing = buildings.filter((b) => !hasLocation(b)).length;
  useEffect(() => {
    if (!import.meta.env.VITE_NAVER_MAP_CLIENT_ID) return;
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    let instance: any;
    setPhase("loading");
    loadSdk()
      .then((n) => {
        if (cancelled || !container.current) return;
        sdk.current = n;
        instance = new n.Map(container.current, {
          center: new n.LatLng(
            camera.current?.latitude ?? 37.5665,
            camera.current?.longitude ?? 126.978,
          ),
          zoom: camera.current?.zoom ?? 12,
          minZoom: 7,
          maxZoom: 21,
          zoomControl: true,
          zoomControlOptions: { position: n.Position.RIGHT_BOTTOM },
        });
        map.current = instance;
        n.Event.addListener(instance, "idle", () => {
          setHoveredDistrict(null);
          const center = instance.getCenter();
          // Zooming back out restores the geographical overview, except while
          // applying a region's navigation camera.
          if (
            !focusingDistrict.current &&
            instance.getZoom() <= 12 &&
            instance.getZoom() < (camera.current?.zoom ?? 12)
          ) {
            activeDistrictRef.current = null;
            setActiveDistrict(null);
          }
          focusingDistrict.current = false;
          camera.current = {
            latitude: center.lat(),
            longitude: center.lng(),
            zoom: instance.getZoom(),
            district: activeDistrictRef.current,
          };
          setViewport((v) => v + 1);
        });
        n.Event.addListener(instance, "click", () => setOverlap([]));
        observer = new ResizeObserver(() =>
          n.Event.trigger(instance, "resize"),
        );
        observer.observe(container.current);
        setPhase("ready");
      })
      .catch(() => {
        if (!cancelled) setPhase("error");
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
      if (instance) {
        sdk.current.Event.clearInstanceListeners(instance);
        instance.destroy();
      }
      map.current = null;
    };
  }, [attempt]);
  function highlightDistrict(key: DistrictKey | null) {
    setHoveredDistrict(key);
    highlightBoundary.current(key);
  }
  function focusDistrict(key: DistrictKey) {
    if (!map.current) return;
    setHoveredDistrict(null);
    const boundary = boundaries.find((b) => b.properties.key === key)!;
    const [west, south, east, north] = boundary.bbox;
    const n = sdk.current;
    setOverlap([]);
    activeDistrictRef.current = key;
    focusingDistrict.current = true;
    setActiveDistrict(key);
    if (key === "Others") {
      // Seoul Others is geographically dispersed. Open its southwest cluster
      // around Sindorim instead of centring Seoul's complete bounding box.
      map.current.setCenter(new n.LatLng(37.509, 126.891));
      map.current.setZoom(15);
      return;
    }
    map.current.fitBounds(
      new n.LatLngBounds(new n.LatLng(south, west), new n.LatLng(north, east)),
      { top: 110, right: 45, bottom: 65, left: 45, maxZoom: 16 },
    );
    map.current.setZoom(Math.min(17, map.current.getZoom() + 1));
  }
  function focus(group: MapGroup) {
    if (!map.current) return;
    setOverlap([]);
    const located = group.buildings.filter(hasLocation);
    if (!located.length) return;
    if (zoom >= 19) {
      setOverlap(group.buildings.map((b) => b.id));
      return;
    }
    const lat =
      located.reduce((sum, b) => sum + b.latitude, 0) / located.length;
    const lng =
      located.reduce((sum, b) => sum + b.longitude, 0) / located.length;
    map.current.setCenter(new sdk.current.LatLng(lat, lng));
    map.current.setZoom(Math.min(21, zoom + 2));
  }
  useEffect(() => {
    if (phase !== "ready" || !map.current || zoom > 15) return;
    const n = sdk.current;
    const visible = boundaries.filter(
      (b) => overview || b.properties.key === activeDistrict,
    );
    const overlays = visible.flatMap((boundary) => {
      const district = districts.find(
        (d) => d.key === boundary.properties.key,
      )!;
      return boundary.geometry.coordinates.map((rings) => {
        // Each MultiPolygon part has an outer ring and optional inner holes.
        // In particular, Others must not cover CBD, GBD or Yeouido.
        const polygon = new n.Polygon({
          map: map.current,
          paths: rings.map((ring) =>
            ring.map(([lng, lat]) => new n.LatLng(lat, lng)),
          ),
          fillColor: district.color,
          fillOpacity: overview
            ? district.key === "Others"
              ? 0.09
              : 0.58
            : 0.07,
          strokeColor: district.color,
          strokeWeight: overview ? 3 : 2.5,
          strokeOpacity: 0.9,
          clickable: overview,
          zIndex: district.key === "Others" ? 1 : 2,
        });
        const listeners = overview
          ? [
              n.Event.addListener(polygon, "click", () =>
                focusDistrict(district.key),
              ),
              n.Event.addListener(polygon, "mouseover", () =>
                highlightDistrict(district.key),
              ),
              n.Event.addListener(polygon, "mouseout", () =>
                highlightDistrict(null),
              ),
            ]
          : [];
        return { polygon, listeners, key: district.key };
      });
    });
    highlightBoundary.current = (key) => {
      overlays.forEach(({ polygon, key: districtKey }) => {
        const highlighted = districtKey === key;
        polygon.setOptions({
          fillOpacity: highlighted
            ? districtKey === "Others"
              ? 0.18
              : 0.78
            : overview
              ? districtKey === "Others"
                ? 0.09
                : 0.58
              : 0.07,
          strokeWeight: (overview ? 3 : 2.5) + (highlighted ? 0.5 : 0),
          strokeOpacity: highlighted ? 1 : 0.9,
        });
      });
    };
    return () => {
      highlightBoundary.current = () => {};
      overlays.forEach(({ polygon, listeners }) => {
        listeners.forEach((listener) => n.Event.removeListener(listener));
        polygon.setMap(null);
      });
    };
  }, [phase, overview, activeDistrict, zoom]);
  useEffect(() => {
    if (phase !== "ready" || !map.current) return;
    const n = sdk.current;
    const currentZoom = map.current.getZoom();
    const groups = overview
      ? districts.map((d) => {
          const boundary = boundaries.find((b) => b.properties.key === d.key)!;
          return {
            id: d.key,
            label: d.label,
            longitude: boundary.properties.labelPosition[0],
            latitude: boundary.properties.labelPosition[1],
            buildings: buildings.filter((b) => b.region === d.key),
          };
        })
      : spatialGroups(buildings, currentZoom);
    const markers = groups.map((group) => {
      const single = !group.label && group.buildings.length === 1;
      const b = group.buildings[0];
      const button = document.createElement("button");
      button.type = "button";
      button.className = single
        ? `map-marker ${selected === b.id ? "active" : ""}`
        : group.label
          ? `map-region-label${group.id === "Others" ? " is-others" : ""}`
          : "map-cluster";
      if (single) {
        const dot = document.createElement("span");
        dot.className = "map-marker-dot";
        dot.setAttribute("aria-hidden", "true");
        const name = document.createElement("span");
        name.className = "map-marker-name";
        name.textContent = b.name.split(/\s*[（(]/)[0].trim() || b.name;
        button.append(dot, name);
      } else {
        if (group.label) {
          const label = document.createElement("span");
          label.textContent = group.label;
          button.append(label);
        }
        const count = document.createElement("strong");
        count.textContent = `${group.buildings.length}${group.label ? "개" : ""}`;
        button.append(count);
      }
      button.setAttribute(
        "aria-label",
        single
          ? `${b.name} 선택`
          : `${group.label || "인근"} 자산 ${group.buildings.length}개 확대`,
      );
      if (single) button.title = b.name;
      const activate = (event: MouseEvent) => {
        event.stopPropagation();
        if (group.label) focusDistrict(group.id as DistrictKey);
        else if (single) onSelect(b.id);
        else focus(group);
      };
      button.addEventListener("click", activate);
      const highlight = () => {
        if (group.label) highlightDistrict(group.id as DistrictKey);
      };
      const unhighlight = () => {
        if (group.label) highlightDistrict(null);
      };
      button.addEventListener("mouseenter", highlight);
      button.addEventListener("mouseleave", unhighlight);
      button.addEventListener("focus", highlight);
      button.addEventListener("blur", unhighlight);
      const marker = new n.Marker({
        map: map.current,
        position: new n.LatLng(group.latitude, group.longitude),
        icon: { content: button, anchor: new n.Point(0, 0) },
        zIndex: group.label ? 100 : single ? 10 : 50,
      });
      return { marker, button, activate, highlight, unhighlight };
    });
    return () =>
      markers.forEach(
        ({ marker, button, activate, highlight, unhighlight }) => {
          button.removeEventListener("click", activate);
          button.removeEventListener("mouseenter", highlight);
          button.removeEventListener("mouseleave", unhighlight);
          button.removeEventListener("focus", highlight);
          button.removeEventListener("blur", unhighlight);
          marker.setMap(null);
        },
      );
  }, [phase, buildings, selected, onSelect, viewport, overview]);
  const overlapping = buildings.filter((b) => overlap.includes(b.id));
  return (
    <div
      className="map-shell"
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setTooltipPoint({
          x: Math.max(
            8,
            Math.min(event.clientX - rect.left + 18, rect.width - 272),
          ),
          y: Math.max(
            8,
            Math.min(event.clientY - rect.top + 20, rect.height - 285),
          ),
        });
      }}
      onPointerLeave={() => highlightDistrict(null)}
    >
      <div className="map-canvas" ref={container} aria-label="네이버 지도" />
      {phase === "ready" && (
        <>
          <div className="map-districts" aria-label="지도 권역">
            {districts.map((d) => {
              const group = districtGroups(buildings).find(
                (g) => g.id === d.key,
              );
              return (
                <button
                  key={d.key}
                  aria-pressed={activeDistrict === d.key}
                  aria-label={`${d.label} · ${d.name}`}
                  onMouseEnter={() => highlightDistrict(d.key)}
                  onMouseLeave={() => highlightDistrict(null)}
                  onFocus={() => highlightDistrict(d.key)}
                  onBlur={() => highlightDistrict(null)}
                  onClick={() => focusDistrict(d.key)}
                >
                  {d.label}
                  <b>{group?.buildings.length ?? 0}</b>
                </button>
              );
            })}
            <button
              onClick={() => {
                setOverlap([]);
                activeDistrictRef.current = null;
                setActiveDistrict(null);
                map.current.setCenter(new sdk.current.LatLng(37.5665, 126.978));
                map.current.setZoom(12);
              }}
            >
              전체
            </button>
          </div>
          {hoveredDistrict && stats && (
            <section
              className="map-region-tooltip"
              role="tooltip"
              style={{ left: tooltipPoint.x, top: tooltipPoint.y }}
            >
              <strong>
                {districts.find((d) => d.key === hoveredDistrict)?.label}
              </strong>
              <dl>
                <div>
                  <dt>오피스 개수</dt>
                  <dd>{stats.count.toLocaleString()}개</dd>
                </div>
                <div>
                  <dt>총 연면적</dt>
                  <dd>{formatArea(stats.area)}</dd>
                </div>
                <div>
                  <dt>평균 NOC</dt>
                  <dd>{nocText(stats.average)}</dd>
                </div>
                <div>
                  <dt>최고 NOC</dt>
                  <dd>{nocText(stats.highest)}</dd>
                </div>
                <div>
                  <dt>최저 NOC</dt>
                  <dd>{nocText(stats.lowest)}</dd>
                </div>
              </dl>
              <p>
                {stats.period ?? "기준분기 미확인"} · NOC {stats.samples}개
                원문값 기준 · 단순평균
              </p>
              <p>
                면적·부가세 기준 미확인
                {stats.planned ? " · 계획 연면적 포함" : ""}
              </p>
              <p>현재 검색·필터 결과 기준</p>
            </section>
          )}
          {missing > 0 && (
            <div className="map-location-status">위치 확인 중 {missing}개</div>
          )}
          <div className="map-boundary-source">
            <a
              href="http://www.gisdeveloper.co.kr/?p=2332"
              target="_blank"
              rel="noreferrer"
              title="지오서비스 법정동 경계 · 2023.07 · 지도 표시용 단순화"
            >
              경계 © 지오서비스
            </a>
            <span> · </span>
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
              title="도로 선형 © OpenStreetMap contributors · ODbL"
            >
              도로 © OpenStreetMap
            </a>
          </div>
          {overlapping.length > 0 && (
            <section className="map-overlap" aria-label="가까운 위치의 자산">
              <header>
                <strong>이 위치의 자산 {overlapping.length}개</strong>
                <button aria-label="목록 닫기" onClick={() => setOverlap([])}>
                  <X size={16} />
                </button>
              </header>
              {overlapping.map((b) => (
                <button key={b.id} onClick={() => onSelect(b.id)}>
                  <strong>{b.name}</strong>
                  <span>
                    {b.status === "development" ? "개발 예정" : "기성"} ·{" "}
                    {formatArea(b.gross_area_m2)} · {b.address}
                  </span>
                </button>
              ))}
            </section>
          )}
        </>
      )}
      {phase !== "ready" && (
        <div className="map-placeholder">
          <span className="map-emblem">
            <MapPin size={28} />
          </span>
          <h2>
            {phase === "loading"
              ? "지도를 불러오고 있습니다"
              : phase === "error"
                ? "지도를 불러오지 못했습니다"
                : "공간을 이해하는 지도"}
          </h2>
          <p>
            {phase === "missing"
              ? "지도 서비스 연결을 준비하고 있습니다."
              : phase === "error"
                ? "잠시 후 다시 시도해 주세요."
                : "건물과 주변 입지를 함께 살펴보세요."}
          </p>
          {phase === "error" && (
            <button onClick={() => setAttempt((v) => v + 1)}>
              <RefreshCw size={14} />
              다시 시도
            </button>
          )}
        </div>
      )}
      <div className="map-caption">
        WORKPLACE SEOUL <span>공간의 가치를 더 깊이</span>
      </div>
    </div>
  );
}
