import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { loadPanorama } from "../lib/panorama";
import { bearingToBuilding } from "../lib/asset-media";

// Naver Panorama's widest supported field of view (minimum magnification).
export const ROADVIEW_WIDEST_FOV = 100;

export type RoadviewPosition = {
  panoId: string;
  pov: { pan: number; tilt: number; fov: number };
};

export default function AssetRoadview({
  latitude,
  longitude,
  position,
  onExpand,
  onUnavailable,
}: {
  latitude: number;
  longitude: number;
  position: MutableRefObject<RoadviewPosition | null>;
  onExpand?: () => void;
  onUnavailable: (message: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [status, setStatus] = useState("로드뷰를 불러오고 있습니다.");
  useEffect(() => {
    let alive = true;
    let pano: any;
    let maps: any;
    let observer: ResizeObserver | undefined;
    const listeners: any[] = [];
    const element = host.current!;
    setStatus("로드뷰를 불러오고 있습니다.");
    const timer = setTimeout(() => {
      if (alive)
        onUnavailable(
          "로드뷰 연결이 지연되고 있습니다. 로드뷰 버튼으로 다시 시도해 주세요.",
        );
    }, 20000);
    void loadPanorama()
      .then((sdk) => {
        if (!alive) return;
        maps = sdk;
        const previous = position.current;
        pano = new maps.Panorama(element, {
          ...(previous || {
            position: new maps.LatLng(latitude, longitude),
            pov: { pan: 0, tilt: 12, fov: ROADVIEW_WIDEST_FOV },
          }),
          flightSpot: false,
          logoControl: false,
          zoomControl: true,
          zoomControlOptions: { position: maps.Position.TOP_LEFT },
        });
        let oriented = !!previous;
        const remember = () => {
          if (pano.getPanoId())
            position.current = { panoId: pano.getPanoId(), pov: pano.getPov() };
        };
        const orient = () => {
          const location = pano.getLocation();
          if (!oriented && location?.coord) {
            oriented = true;
            pano.setPov({
              pan: bearingToBuilding(
                location.coord.lat(),
                location.coord.lng(),
                latitude,
                longitude,
              ),
              tilt: 12,
              fov: ROADVIEW_WIDEST_FOV,
            });
          }
          remember();
        };
        listeners.push(
          maps.Event.addListener(pano, "pano_status", (result: string) => {
            if (!alive) return;
            clearTimeout(timer);
            if (result === "OK") {
              setStatus("");
              orient();
            } else
              onUnavailable(
                "이 위치에는 제공되는 로드뷰가 없어 기본사진을 표시합니다.",
              );
          }),
        );
        listeners.push(maps.Event.addListener(pano, "pano_changed", orient));
        listeners.push(maps.Event.addListener(pano, "pov_changed", remember));
        observer = new ResizeObserver(() => {
          if (element.clientWidth && element.clientHeight)
            pano.setSize(
              new maps.Size(element.clientWidth, element.clientHeight),
            );
        });
        observer.observe(element);
      })
      .catch(() => {
        if (alive) {
          clearTimeout(timer);
          onUnavailable(
            "로드뷰를 연결하지 못했습니다. 로드뷰 버튼으로 다시 시도해 주세요.",
          );
        }
      });
    return () => {
      alive = false;
      clearTimeout(timer);
      observer?.disconnect();
      listeners.forEach((listener) => maps.Event.removeListener(listener));
      pano?.setVisible(false);
      element.replaceChildren();
    };
  }, [latitude, longitude, position, onUnavailable]);
  return (
    <div className="asset-roadview">
      <div
        ref={host}
        className="asset-roadview-canvas"
        aria-label="건물 주변 로드뷰"
        onPointerDownCapture={(event) => {
          if (!event.isPrimary) {
            if (gesture.current) gesture.current.moved = true;
            return;
          }
          gesture.current = {
            x: event.clientX,
            y: event.clientY,
            moved: false,
          };
        }}
        onPointerMoveCapture={(event) => {
          const start = gesture.current;
          if (
            start &&
            Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6
          )
            start.moved = true;
        }}
        onPointerCancelCapture={() => {
          gesture.current = null;
        }}
        onPointerUpCapture={(event) => {
          const start = gesture.current;
          gesture.current = null;
          if (
            start &&
            !start.moved &&
            !status &&
            !(event.target as HTMLElement).closest(
              "a, button, input, [role=button]",
            )
          )
            onExpand?.();
        }}
      />
      {status && (
        <div className="asset-roadview-status" role="status">
          <p>{status}</p>
        </div>
      )}
    </div>
  );
}
