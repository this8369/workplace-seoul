import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Building2,
  Camera,
  ChevronLeft,
  ChevronRight,
  Expand,
  Image,
  X,
} from "lucide-react";
import type { Building } from "../lib/domain";
import type { BuildingImage } from "../lib/building-images";
import { hasLocation } from "../lib/map-clusters";
import { mediaLayerLeft } from "../lib/asset-media";
import BuildingPhoto from "./BuildingPhoto";
import AssetRoadview, { type RoadviewPosition } from "./AssetRoadview";
import "./AssetMedia.css";

export default function AssetMedia({
  building,
  photo,
  photos,
  onPhoto,
}: {
  building: Building;
  photo?: BuildingImage;
  photos: BuildingImage[];
  onPhoto: (id: string) => void;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const roadviewPosition = useRef<RoadviewPosition | null>(null);
  const [mode, setMode] = useState<"photo" | "roadview">("photo");
  const [notice, setNotice] = useState("");
  const unavailable = useCallback((message: string) => {
    roadviewPosition.current = null;
    setNotice(message);
    setMode("photo");
  }, []);
  function chooseMode(next: "photo" | "roadview") {
    setNotice("");
    setMode(next);
  }
  const [expanded, setExpanded] = useState(false);
  const [layer, setLayer] = useState<{
    target: HTMLElement;
    left: number;
  } | null>(null);
  const available = hasLocation(building);
  const index = Math.max(
    0,
    photos.findIndex((item) => item.id === photo?.id),
  );

  useLayoutEffect(() => {
    if (!expanded) return;
    const target = anchor.current?.closest<HTMLElement>(".map-region");
    const detail = anchor.current?.closest<HTMLElement>(".asset-popup");
    if (!target || !detail) return;
    const measure = () => {
      const mapBounds = target.getBoundingClientRect();
      const detailBounds = detail.getBoundingClientRect();
      setLayer({
        target,
        left: mediaLayerLeft(
          mapBounds.width,
          detailBounds.right - mapBounds.left,
        ),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    observer.observe(detail);
    return () => observer.disconnect();
  }, [expanded]);

  useLayoutEffect(() => {
    if (expanded && layer) closeButton.current?.focus({ preventScroll: true });
  }, [expanded, !!layer]);

  function expand() {
    returnFocus.current = document.activeElement as HTMLElement | null;
    setExpanded(true);
  }
  function close() {
    setExpanded(false);
    setLayer(null);
    const target = returnFocus.current?.isConnected
      ? returnFocus.current
      : anchor.current?.querySelector<HTMLButtonElement>(".asset-media-expand");
    target?.focus({ preventScroll: true });
  }
  const photoContent = photo ? (
    <BuildingPhoto image={photo} detail />
  ) : (
    <div className="asset-media-empty">
      <Building2 size={38} />
      <span>건물 사진 준비 중</span>
    </div>
  );
  const content = (large: boolean) =>
    mode === "roadview" && available ? (
      <AssetRoadview
        latitude={building.latitude!}
        longitude={building.longitude!}
        position={roadviewPosition}
        onExpand={large ? undefined : expand}
        onUnavailable={unavailable}
      />
    ) : large ? (
      photoContent
    ) : (
      <button
        className="asset-media-photo-button"
        onClick={expand}
        aria-label="건물 사진 크게 보기"
      >
        {photoContent}
      </button>
    );

  const switchMode = (
    <button
      className="asset-media-switch"
      onClick={() => chooseMode(mode === "photo" ? "roadview" : "photo")}
    >
      {mode === "photo" ? <Camera size={16} /> : <Image size={16} />}
      {mode === "photo" ? "로드뷰" : "사진 보기"}
    </button>
  );

  return (
    <>
      <div className="asset-photo-frame asset-media-frame" ref={anchor}>
        {expanded ? (
          <button
            className="asset-media-photo-button"
            onClick={() => closeButton.current?.focus()}
            aria-label="확대 화면으로 이동"
          >
            {photoContent}
          </button>
        ) : (
          content(false)
        )}
        {mode === "photo" && (
          <span className="asset-photo-kind">
            {photo?.kind === "rendering" ? "조감도" : "건물 사진"}
          </span>
        )}
        <button
          className="asset-media-expand"
          onClick={expand}
          aria-label="사진·로드뷰 크게 보기"
        >
          <Expand size={17} />
        </button>
        {available && !expanded && switchMode}
      </div>
      {notice && !expanded && (
        <p className="asset-media-notice" role="status">
          {notice}
        </p>
      )}
      {expanded &&
        layer &&
        createPortal(
          <section
            className="asset-media-layer"
            style={{ left: layer.left }}
            role="dialog"
            aria-modal="false"
            aria-label={`${building.name} 사진·로드뷰 확대`}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                close();
              }
            }}
          >
            <div className="asset-media-toolbar">
              <strong>{building.name}</strong>
              <div className="asset-media-tabs">
                <button
                  aria-pressed={mode === "photo"}
                  onClick={() => chooseMode("photo")}
                >
                  사진
                </button>
                {available && (
                  <button
                    aria-pressed={mode === "roadview"}
                    onClick={() => chooseMode("roadview")}
                  >
                    로드뷰
                  </button>
                )}
              </div>
              <button
                ref={closeButton}
                className="asset-media-close"
                onClick={close}
                aria-label="확대 보기 닫기"
              >
                <X size={22} />
              </button>
            </div>
            <div className="asset-media-stage">{content(true)}</div>
            {notice && (
              <p className="asset-media-notice" role="status">
                {notice}
              </p>
            )}
            {mode === "photo" && (
              <div className="asset-media-caption">
                <span>
                  {photo?.title || "건물 사진 준비 중"}
                  {photo?.credit || photo?.source_name
                    ? ` · ${photo.credit || photo.source_name}`
                    : ""}
                </span>
                {photos.length > 1 && (
                  <div className="asset-media-pagination">
                    <button
                      aria-label="이전 사진"
                      onClick={() =>
                        onPhoto(
                          photos[(index - 1 + photos.length) % photos.length]
                            .id,
                        )
                      }
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <span>
                      {index + 1} / {photos.length}
                    </span>
                    <button
                      aria-label="다음 사진"
                      onClick={() =>
                        onPhoto(photos[(index + 1) % photos.length].id)
                      }
                    >
                      <ChevronRight size={20} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>,
          layer.target,
        )}
    </>
  );
}
