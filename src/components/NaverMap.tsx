import { useEffect, useRef, useState } from "react";
import { MapPin, RefreshCw } from "lucide-react";
import type { Building } from "../lib/domain";
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
}: {
  buildings: Building[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<any>(null),
    sdk = useRef<any>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error" | "missing">(
    import.meta.env.VITE_NAVER_MAP_CLIENT_ID ? "loading" : "missing",
  );
  const [attempt, setAttempt] = useState(0);
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
          center: new n.LatLng(37.5665, 126.978),
          zoom: 12,
          zoomControl: true,
          zoomControlOptions: { position: n.Position.RIGHT_BOTTOM },
        });
        map.current = instance;
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
  useEffect(() => {
    if (phase !== "ready" || !map.current) return;
    const n = sdk.current;
    const markers = buildings
      .filter((b) => b.latitude !== null && b.longitude !== null)
      .map((b) => {
        const button = document.createElement("button");
        button.className = `map-marker ${selected === b.id ? "active" : ""}`;
        button.textContent = b.name;
        button.setAttribute("aria-label", `${b.name} 선택`);
        const marker = new n.Marker({
          map: map.current,
          position: new n.LatLng(b.latitude, b.longitude),
          icon: { content: button, anchor: new n.Point(40, 20) },
        });
        const listener = n.Event.addListener(marker, "click", () =>
          onSelect(b.id),
        );
        return { marker, listener };
      });
    return () =>
      markers.forEach(({ marker, listener }) => {
        n.Event.removeListener(listener);
        marker.setMap(null);
      });
  }, [phase, buildings, selected, onSelect]);
  useEffect(() => {
    const b = buildings.find((x) => x.id === selected);
    if (phase === "ready" && b?.latitude != null && b.longitude != null)
      map.current?.panTo(new sdk.current.LatLng(b.latitude, b.longitude));
  }, [selected, phase, buildings]);
  return (
    <div className="map-shell">
      <div className="map-canvas" ref={container} aria-label="네이버 지도" />
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
