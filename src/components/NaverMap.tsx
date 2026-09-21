import type { Leasing, Development } from "../lib/catalog";
import type { MapBounds } from "../lib/map-list";
import {
  complexMapBuildings,
  towersFor,
  towerNocFact,
  type BuildingComplex,
  type BuildingTower,
} from "../lib/building-towers";
import { regionStats } from "../lib/region-stats";
import {
  mapMarkerFacts,
  markerNocIndex,
  markerDevelopmentIndex,
} from "../lib/map-marker-facts";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MapPin, RefreshCw, X } from "lucide-react";
import { formatArea, type Building } from "../lib/domain";
import {
  districts,
  spatialGroups,
  hasLocation,
  type MapGroup,
} from "../lib/map-clusters";
import {
  displayBoundaries as boundaries,
  homeMapCenter,
  type DistrictKey,
} from "../lib/map-regions";
export type MapCamera = {
  latitude: number;
  longitude: number;
  zoom: number;
  district?: DistrictKey | null;
  filterRegion?: string;
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
  complexes = [],
  towers = [],
  leasing,
  developments,
  selected,
  onSelect,
  camera,
  homeRequest,
  region,
  onBoundsChange,
}: {
  buildings: Building[];
  complexes?: BuildingComplex[];
  towers?: BuildingTower[];
  leasing: Leasing[];
  developments: Development[];
  selected: string | null;
  onSelect: (id: string) => void;
  camera: { current: MapCamera | null };
  homeRequest: number;
  region: string;
  onBoundsChange: (bounds: MapBounds) => void;
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
  const markerDevelopment = useMemo(
    () => markerDevelopmentIndex(developments),
    [developments],
  );
  const markerNoc = useMemo(() => markerNocIndex(leasing), [leasing]);
  const mapBuildings = useMemo(
    () => complexMapBuildings(buildings, complexes),
    [buildings, complexes],
  );
  const nocText = (value: number | null) =>
    value === null
      ? "미확인"
      : `${Math.round(value).toLocaleString("ko-KR")} 원/평`;
  const [overlap, setOverlap] = useState<MapGroup | null>(null);
  const [overlapHost] = useState(() => document.createElement("div"));
  const [activeDistrict, setActiveDistrict] = useState<DistrictKey | null>(
    camera.current?.district ?? null,
  );
  const activeDistrictRef = useRef(activeDistrict);
  const lastHomeRequest = useRef(homeRequest);
  const lastRegion = useRef(camera.current?.filterRegion ?? "");
  const focusingDistrict = useRef(false);
  const highlightBoundary = useRef<(key: DistrictKey | null) => void>(() => {});
  const zoom = map.current?.getZoom() ?? camera.current?.zoom ?? 12;
  const overview = zoom <= 12 && !activeDistrict;
  useEffect(() => {
    if (!import.meta.env.VITE_NAVER_MAP_CLIENT_ID) return;
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    let instance: any;
    setPhase("loading");
    loadSdk()
      .then((n) => {
        if (cancelled || !container.current) return;
        sdk.current = n;
        instance = new n.Map(container.current, {
          center: new n.LatLng(
            camera.current?.latitude ?? homeMapCenter().latitude,
            camera.current?.longitude ?? homeMapCenter().longitude,
          ),
          zoom: camera.current?.zoom ?? 12,
          minZoom: 7,
          maxZoom: 21,
          zoomControl: true,
          zoomControlOptions: { position: n.Position.RIGHT_BOTTOM },
        });
        map.current = instance;
        const publishBounds = () => {
          const bounds = instance.getBounds();
          const sw = bounds.getSW(),
            ne = bounds.getNE();
          onBoundsChange({
            south: sw.lat(),
            west: sw.lng(),
            north: ne.lat(),
            east: ne.lng(),
          });
        };
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
            filterRegion: lastRegion.current,
          };
          publishBounds();
          setViewport((v) => v + 1);
        });
        n.Event.addListener(instance, "click", () => setOverlap(null));
        observer = new ResizeObserver(() => {
          // Resizing on every rail-animation frame makes the SDK rebuild overlays.
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            if (!cancelled) {
              n.Event.trigger(instance, "resize");
              publishBounds();
            }
          }, 80);
        });
        observer.observe(container.current);
        publishBounds();
        setPhase("ready");
      })
      .catch(() => {
        if (!cancelled) setPhase("error");
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
      clearTimeout(resizeTimer);
      if (instance) {
        sdk.current.Event.clearInstanceListeners(instance);
        instance.destroy();
      }
      map.current = null;
    };
  }, [attempt, onBoundsChange]);
  function focusHome() {
    if (!map.current || !sdk.current) return;
    const center = homeMapCenter();
    setHoveredDistrict(null);
    setOverlap(null);
    activeDistrictRef.current = null;
    setActiveDistrict(null);
    focusingDistrict.current = false;
    map.current.setCenter(
      new sdk.current.LatLng(center.latitude, center.longitude),
    );
    map.current.setZoom(12);
  }
  useEffect(() => {
    if (phase !== "ready" || lastHomeRequest.current === homeRequest) return;
    lastHomeRequest.current = homeRequest;
    focusHome();
  }, [homeRequest, phase]);
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
    setOverlap(null);
    activeDistrictRef.current = key;
    focusingDistrict.current = true;
    setActiveDistrict(key);
    const setting = districts.find((d) => d.key === key);
    if (setting?.focus_center && setting.focus_zoom != null) {
      // Explicit district cameras, such as Seoul Others around Sindorim.
      map.current.setCenter(
        new n.LatLng(setting.focus_center[1], setting.focus_center[0]),
      );
      map.current.setZoom(setting.focus_zoom || 15);
      return;
    }
    map.current.fitBounds(
      new n.LatLngBounds(new n.LatLng(south, west), new n.LatLng(north, east)),
      { top: 110, right: 45, bottom: 65, left: 45, maxZoom: 16 },
    );
    map.current.setZoom(Math.min(17, map.current.getZoom() + 1));
    if (setting?.focus_center) {
      map.current.setCenter(
        new n.LatLng(setting.focus_center[1], setting.focus_center[0]),
      );
    }
  }
  useEffect(() => {
    if (phase !== "ready" || lastRegion.current === region) return;
    lastRegion.current = region;
    const district = districts.find((item) => item.key === region);
    if (district) focusDistrict(district.key);
    else if (!region) focusHome();
  }, [region, phase]);
  function focus(group: MapGroup) {
    if (!map.current) return;
    setOverlap(null);
    const located = group.buildings.filter(hasLocation);
    if (!located.length) return;
    const coincident = located.every(
      (b) =>
        Math.abs(b.latitude - located[0].latitude) < 0.00001 &&
        Math.abs(b.longitude - located[0].longitude) < 0.00001,
    );
    if (zoom >= 19 || coincident) {
      setOverlap(group);
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
              ? 0.18
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
              ? 0.3
              : 0.78
            : overview
              ? districtKey === "Others"
                ? 0.18
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
      : spatialGroups(mapBuildings, currentZoom);
    const markers = groups.map((group) => {
      const single = !group.label && group.buildings.length === 1;
      const b = group.buildings[0];
      const towerRows = b ? towersFor(b, towers) : [];
      const active =
        selected === b?.id ||
        mapBuildings
          .find((m) => m.id === b?.id)
          ?.member_ids?.includes(selected || "");
      const button = document.createElement("button");
      button.type = "button";
      button.className = single
        ? `map-marker ${b.status === "development" ? "is-development" : ""} ${active ? "active" : ""} ${towerRows.length ? "has-towers" : ""}`
        : group.label
          ? `map-region-label${group.id === "Others" ? " is-others" : ""}`
          : "map-cluster";
      if (single) {
        const dot = document.createElement("span");
        dot.className = "map-marker-dot";
        dot.setAttribute("aria-hidden", "true");
        const bubble = document.createElement("span");
        bubble.className = "map-marker-bubble";
        const area = document.createElement("span");
        area.className = "map-marker-area";
        area.textContent = `${b.area_basis === "planned" ? "계획 " : ""}${formatArea(b.gross_area_m2)}`;
        bubble.append(area);
        const name = document.createElement("strong");
        name.className = "map-marker-name";
        name.textContent = b.name.split(/\s*[（(]/)[0].trim() || b.name;
        bubble.append(name);
        const facts = document.createElement("span");
        facts.className = "map-marker-facts";
        const values = mapMarkerFacts(
          b,
          markerNoc.get(b.id),
          markerDevelopment.get(b.id),
          towerRows,
        );
        if (towerRows.length && b.status === "operating") {
          const nocIndex = values.findIndex((f) => f.label === "NOC");
          values[nocIndex] = towerNocFact(
            mapBuildings.find((m) => m.id === b.id) || b,
            towerRows,
            markerNoc,
          );
        }
        // Gross floor area is already visible in the bubble's header.
        for (const fact of values.slice(1)) {
          const row = document.createElement("span");
          row.className = "map-marker-fact";
          const label = document.createElement("span");
          label.className = "map-marker-fact-label";
          label.textContent = fact.label;
          if (fact.note) {
            const note = document.createElement("small");
            note.textContent = fact.note;
            label.append(note);
          }
          const value = document.createElement("span");
          value.className = "map-marker-fact-value";
          value.textContent = fact.value;
          row.append(label, value);
          facts.append(row);
        }
        if (b.typical_floor_scope && !towerRows.length) {
          const scope = document.createElement("span");
          scope.className = "map-marker-scope";
          scope.textContent = b.typical_floor_scope;
          facts.append(scope);
        }
        bubble.append(facts);
        button.append(dot, bubble);
        button.setAttribute(
          "aria-description",
          values
            .map((f) => `${f.label} ${f.value}${f.note ? ` (${f.note})` : ""}`)
            .concat(b.typical_floor_scope ? [b.typical_floor_scope] : [])
            .join(", "),
        );
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
      const activate = (event: MouseEvent) => {
        event.stopPropagation();
        if (group.label) focusDistrict(group.id as DistrictKey);
        else if (single) onSelect(b.id);
        else focus(group);
      };
      button.addEventListener("click", activate);
      const highlight = () => {
        if (group.label) highlightDistrict(group.id as DistrictKey);
        else if (single) {
          marker.setZIndex(1000);
        }
      };
      const unhighlight = () => {
        if (group.label) highlightDistrict(null);
        else if (single) {
          marker.setZIndex(active ? 300 : 10);
        }
      };
      button.addEventListener("mouseenter", highlight);
      button.addEventListener("mouseleave", unhighlight);
      button.addEventListener("focus", highlight);
      button.addEventListener("blur", unhighlight);
      const marker = new n.Marker({
        map: map.current,
        position: new n.LatLng(group.latitude, group.longitude),
        icon: { content: button, anchor: new n.Point(0, 0) },
        zIndex: group.label ? 100 : single ? (active ? 300 : 10) : 50,
      });
      if (!single && !group.label && overlap?.id === group.id)
        marker.setVisible(false);
      // Decide placement before hover so expansion cannot move away from the
      // pointer and cause a repeated mouseenter/mouseleave loop.
      const positionFrame = requestAnimationFrame(() => {
        const bounds = container.current?.getBoundingClientRect();
        if (single && bounds) {
          const anchor = button.getBoundingClientRect();
          const expandedWidth = Math.min(
            towerRows.length ? 370 : 240,
            window.innerWidth - 84,
          );
          button.classList.toggle(
            "opens-left",
            anchor.left + expandedWidth > bounds.right - 8 &&
              anchor.left - bounds.left > expandedWidth,
          );
        }
      });
      return {
        marker,
        button,
        activate,
        highlight,
        unhighlight,
        positionFrame,
      };
    });
    return () =>
      markers.forEach(
        ({
          marker,
          button,
          activate,
          highlight,
          unhighlight,
          positionFrame,
        }) => {
          cancelAnimationFrame(positionFrame);
          button.removeEventListener("click", activate);
          button.removeEventListener("mouseenter", highlight);
          button.removeEventListener("mouseleave", unhighlight);
          button.removeEventListener("focus", highlight);
          button.removeEventListener("blur", unhighlight);
          marker.setMap(null);
        },
      );
  }, [
    phase,
    buildings,
    mapBuildings,
    towers,
    markerNoc,
    markerDevelopment,
    selected,
    onSelect,
    viewport,
    overview,
    overlap,
  ]);
  const overlapping = overlap
    ? mapBuildings
        .filter((b) => overlap.buildings.some((item) => item.id === b.id))
        .sort((a, b) => a.name.localeCompare(b.name, "ko", { numeric: true }))
    : [];
  useEffect(() => {
    if (phase !== "ready" || !map.current || !overlap || !overlapping.length)
      return;
    const n = sdk.current;
    const marker = new n.Marker({
      map: map.current,
      position: new n.LatLng(overlap.latitude, overlap.longitude),
      icon: { content: overlapHost, anchor: new n.Point(8, 8) },
      zIndex: 1100,
    });
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOverlap(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    // Pan the map just enough to keep the anchored bubble inside the viewport.
    // The geographic point and its pointer move together; no detached panel.
    const frame = requestAnimationFrame(() => {
      const bounds = container.current?.getBoundingClientRect();
      const bubble = overlapHost.querySelector<HTMLElement>(
        ".map-coincident-bubble",
      );
      if (!bounds || !bubble) return;
      bubble.style.width = `${Math.min(360, bounds.width - 24)}px`;
      bubble.style.maxHeight = `${Math.max(100, bounds.height - 48)}px`;
      const rect = bubble.getBoundingClientRect();
      const dx =
        rect.right > bounds.right - 12
          ? rect.right - bounds.right + 12
          : rect.left < bounds.left + 12
            ? rect.left - bounds.left - 12
            : 0;
      const dy =
        rect.top < bounds.top + 12
          ? rect.top - bounds.top - 12
          : rect.bottom > bounds.bottom - 24
            ? rect.bottom - bounds.bottom + 24
            : 0;
      if (dx || dy) map.current.panBy(new n.Point(dx, dy));
      bubble
        .querySelector<HTMLButtonElement>(".map-coincident-item")
        ?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", closeOnEscape);
      marker.setMap(null);
    };
  }, [phase, overlap, overlapHost, overlapping.length]);
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
          {overlap &&
            overlapping.length > 0 &&
            createPortal(
              <div
                className="map-coincident"
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.stopPropagation();
                    setOverlap(null);
                  }
                }}
              >
                <span className="map-marker-dot" aria-hidden="true" />
                <section
                  className="map-marker-bubble map-coincident-bubble"
                  aria-label="같은 위치의 자산"
                >
                  <header className="map-coincident-heading">
                    <strong>
                      이 위치의 자산 <b>{overlapping.length}</b>
                    </strong>
                    <button
                      type="button"
                      aria-label="자산 말풍선 닫기"
                      onClick={() => setOverlap(null)}
                    >
                      <X size={14} />
                    </button>
                  </header>
                  <div className="map-coincident-grid">
                    {overlapping.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        className={`map-coincident-item ${b.status === "development" ? "is-development" : ""}`}
                        aria-label={`${b.name} 선택`}
                        onClick={() => onSelect(b.id)}
                      >
                        <span className="map-coincident-area">
                          {b.area_basis === "planned" ? "계획 " : ""}
                          {formatArea(b.gross_area_m2)}
                        </span>
                        <strong>{b.name}</strong>
                        <span className="map-coincident-status">
                          {b.status === "development" ? "개발중" : "실물"}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              </div>,
              overlapHost,
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
