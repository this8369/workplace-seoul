import { useEffect, useRef, useState } from "react";
import type { Building } from "../lib/domain";
import type { Parcel } from "../lib/asset-context";
import { parcelPolygons } from "../lib/parcel-geometry";
import { loadSdk } from "./NaverMap";

export default function ParcelMap({
  building,
  parcels,
}: {
  building: Building;
  parcels: Parcel[];
}) {
  const node = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    let map: any;
    let observer: ResizeObserver | undefined;
    setError(false);
    setReady(false);
    if (building.latitude == null || building.longitude == null) return;
    loadSdk()
      .then((n) => {
        if (!alive || !node.current) return;
        const center = new n.LatLng(building.latitude, building.longitude);
        map = new n.Map(node.current, {
          center,
          zoom: 17,
          scrollWheel: false,
          zoomControl: true,
          zoomControlOptions: { position: n.Position.RIGHT_BOTTOM },
        });
        const bounds = new n.LatLngBounds();
        let points = 0;
        for (const parcel of parcels)
          for (const polygon of parcelPolygons(parcel.geometry)) {
            const paths = polygon.map((ring) =>
              ring.map(([lng, lat]) => {
                const point = new n.LatLng(lat, lng);
                bounds.extend(point);
                points++;
                return point;
              }),
            );
            new n.Polygon({
              map,
              paths,
              fillColor: "#5367c4",
              fillOpacity: 0.16,
              strokeColor: "#32469d",
              strokeWeight: 2,
              strokeOpacity: 0.95,
            });
          }
        new n.Marker({ map, position: center, title: building.name });
        if (points)
          map.fitBounds(bounds, { top: 36, right: 36, bottom: 36, left: 36 });
        observer = new ResizeObserver(() => {
          if (node.current) {
            map.setSize(
              new n.Size(node.current.clientWidth, node.current.clientHeight),
            );
          }
        });
        observer.observe(node.current);
        setReady(true);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
      observer?.disconnect();
      map?.destroy();
    };
  }, [
    building.id,
    building.latitude,
    building.longitude,
    building.name,
    parcels,
  ]);
  return (
    <div className="parcel-map-wrap">
      <div
        ref={node}
        className="parcel-map"
        aria-label={`${building.name} 위치 및 필지 경계 지도`}
      />
      {!ready && (
        <div className="parcel-map-message" role="status">
          {error
            ? "지도를 불러오지 못했습니다."
            : building.latitude == null || building.longitude == null
              ? "등록된 위치가 없습니다."
              : "지도를 불러오는 중입니다."}
        </div>
      )}
      <span className="parcel-map-caption">
        {parcels.some((p) => parcelPolygons(p.geometry).length)
          ? "확인된 필지 경계"
          : "자산 위치 · 필지 경계 연결 전"}
      </span>
    </div>
  );
}
