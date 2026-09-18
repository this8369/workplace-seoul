import { useEffect, useRef, useState } from "react";
import { MapPin, RefreshCw, X } from "lucide-react";
import { formatArea, type Building } from "../lib/domain";
import {
  districts,
  districtGroups,
  spatialGroups,
  hasLocation,
  type MapGroup,
} from "../lib/map-clusters";
export type MapCamera = { latitude: number; longitude: number; zoom: number };
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
  selected,
  onSelect,
  camera,
}: {
  buildings: Building[];
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
  const [overlap, setOverlap] = useState<string[]>([]);
  const zoom = map.current?.getZoom() ?? camera.current?.zoom ?? 12;
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
          const center = instance.getCenter();
          camera.current = {
            latitude: center.lat(),
            longitude: center.lng(),
            zoom: instance.getZoom(),
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
  function focus(group: MapGroup) {
    if (!map.current) return;
    setOverlap([]);
    const located = group.buildings.filter(hasLocation);
    if (!located.length) return;
    if (zoom >= 19 && !group.label) {
      setOverlap(group.buildings.map((b) => b.id));
      return;
    }
    const lat =
      located.reduce((sum, b) => sum + b.latitude, 0) / located.length;
    const lng =
      located.reduce((sum, b) => sum + b.longitude, 0) / located.length;
    map.current.setCenter(new sdk.current.LatLng(lat, lng));
    map.current.setZoom(group.label ? 14 : Math.min(21, zoom + 2));
  }
  useEffect(() => {
    if (phase !== "ready" || !map.current) return;
    const n = sdk.current;
    const currentZoom = map.current.getZoom();
    const groups =
      currentZoom <= 12
        ? districtGroups(buildings)
        : spatialGroups(buildings, currentZoom);
    const markers = groups.map((group) => {
      const single = !group.label && group.buildings.length === 1;
      const b = group.buildings[0];
      const button = document.createElement("button");
      button.type = "button";
      button.className = single
        ? `map-marker ${selected === b.id ? "active" : ""}`
        : `map-cluster ${group.label ? "district" : ""}`;
      if (single)
        button.textContent = b.name.split(/\s*[（(]/)[0].trim() || b.name;
      else {
        if (group.label) {
          const label = document.createElement("span");
          label.textContent = group.label;
          button.append(label);
        }
        const count = document.createElement("strong");
        count.textContent = String(group.buildings.length);
        button.append(count);
      }
      button.setAttribute(
        "aria-label",
        single
          ? `${b.name} 선택`
          : `${group.label || "인근"} 자산 ${group.buildings.length}개 확대`,
      );
      button.title = single ? b.name : "클릭하여 자산 살펴보기";
      const activate = (event: MouseEvent) => {
        event.stopPropagation();
        single ? onSelect(b.id) : focus(group);
      };
      button.addEventListener("click", activate);
      const marker = new n.Marker({
        map: map.current,
        position: new n.LatLng(group.latitude, group.longitude),
        icon: { content: button, anchor: new n.Point(0, 0) },
        zIndex: group.label ? 100 : single ? 10 : 50,
      });
      return { marker, button, activate };
    });
    return () =>
      markers.forEach(({ marker, button, activate }) => {
        button.removeEventListener("click", activate);
        marker.setMap(null);
      });
  }, [phase, buildings, selected, onSelect, viewport]);
  const overlapping = buildings.filter((b) => overlap.includes(b.id));
  return (
    <div className="map-shell">
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
                  disabled={!group}
                  title={d.name}
                  onClick={() => group && focus(group)}
                >
                  {d.label}
                  <b>{group?.buildings.length ?? 0}</b>
                </button>
              );
            })}
            <button
              onClick={() => {
                setOverlap([]);
                map.current.setCenter(new sdk.current.LatLng(37.5665, 126.978));
                map.current.setZoom(12);
              }}
            >
              전체
            </button>
          </div>
          <div className="map-level">
            {zoom <= 12
              ? "권역별 자산"
              : zoom < 16
                ? "주변 자산 · 숫자를 누르면 확대"
                : "빌딩을 선택해 자세히 보기"}
            {missing > 0 && <span>위치 확인 중 {missing}개</span>}
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
