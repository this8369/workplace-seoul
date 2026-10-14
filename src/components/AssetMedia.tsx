import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Building2,
  Image,
  ChevronLeft,
  ChevronRight,
  Expand,
  ImagePlus,
  X,
} from "lucide-react";
import type { Building } from "../lib/domain";
import { ReviewRecordButton } from "./DataReview";
import type { BuildingImage } from "../lib/building-images";
import { hasLocation } from "../lib/map-clusters";
import { mediaLayerLeft } from "../lib/asset-media";
import BuildingPhoto from "./BuildingPhoto";
import AssetRoadview, {
  ROADVIEW_WIDEST_FOV,
  type RoadviewPosition,
} from "./AssetRoadview";
import "./AssetMedia.css";
import ImagePager, { galleryKey } from "./ImagePager";
import { adjacentImageId } from "../lib/image-gallery";

function RoadviewIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 2a8 8 0 0 0-8 8c0 5.2 8 12 8 12s8-6.8 8-12a8 8 0 0 0-8-8Z"
        fill="currentColor"
      />
      <path
        d="M8.5 10h7"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FloorPlanIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-5M12 3v7M12 14v7M3 10h9M12 14h9" />
      <path d="M9 21v-5a5 5 0 0 1 5 5" strokeWidth="1" opacity=".65" />
    </svg>
  );
}

export default function AssetMedia({
  building,
  photo,
  photos,
  onPhoto,
  floorPlans,
  onManageImages,
}: {
  building: Building;
  photo?: BuildingImage;
  photos: BuildingImage[];
  onPhoto: (id: string) => void;
  floorPlans: BuildingImage[];
  onManageImages?: () => void;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const roadviewPosition = useRef<RoadviewPosition | null>(null);
  const [mode, setMode] = useState<"photo" | "roadview" | "floor_plan">(
    "photo",
  );
  const [planId, setPlanId] = useState<string>();
  const shown =
    mode === "floor_plan"
      ? floorPlans.find((p) => p.id === planId) || floorPlans[0]
      : photo;
  const imageCaption = [
    shown?.inherited_from_image_id && "단지 공통 사진",
    shown?.floor_label,
    shown?.captured_on && `촬영 ${shown.captured_on}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const gallery = mode === "floor_plan" ? floorPlans : photos;
  function selectImage(id: string) {
    if (mode === "floor_plan") setPlanId(id);
    else onPhoto(id);
  }
  function moveImage(step: -1 | 1) {
    const id = adjacentImageId(gallery, shown?.id, step);
    if (id) selectImage(id);
  }
  const [notice, setNotice] = useState("");
  const unavailable = useCallback((message: string) => {
    roadviewPosition.current = null;
    setNotice(message);
    setMode("photo");
  }, []);
  function chooseMode(next: "photo" | "roadview" | "floor_plan") {
    if (
      next === "roadview" &&
      mode !== "roadview" &&
      roadviewPosition.current
    ) {
      roadviewPosition.current = {
        ...roadviewPosition.current,
        pov: { ...roadviewPosition.current.pov, fov: ROADVIEW_WIDEST_FOV },
      };
    }
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
    gallery.findIndex((item) => item.id === shown?.id),
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
  const photoContent = shown ? (
    <BuildingPhoto image={shown} detail publicRead />
  ) : (
    <div className="asset-media-empty">
      {mode === "floor_plan" ? (
        <FloorPlanIcon size={54} />
      ) : (
        <Building2 size={38} />
      )}
      <span>
        {mode === "floor_plan" ? "평면도 준비 중" : "건물 사진 준비 중"}
      </span>
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
        aria-label={
          mode === "floor_plan" ? "평면도 크게 보기" : "건물 사진 크게 보기"
        }
      >
        {photoContent}
      </button>
    );

  const switchMode = (
    <button
      className="asset-media-switch"
      onClick={() => chooseMode(mode === "roadview" ? "photo" : "roadview")}
    >
      {mode === "roadview" ? <Image size={16} /> : <RoadviewIcon />}
      {mode === "roadview" ? "사진" : "로드뷰"}
    </button>
  );

  return (
    <>
      <div
        className="asset-photo-frame asset-media-frame"
        data-mode={mode}
        onKeyDown={(event) =>
          galleryKey(
            event,
            moveImage,
            !expanded && mode !== "roadview" && gallery.length > 1,
          )
        }
        ref={anchor}
      >
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
        <div className="asset-media-kinds" aria-label="이미지 종류">
          <button
            aria-pressed={mode === "photo"}
            onClick={() => chooseMode("photo")}
          >
            <Image size={16} />
            {photo?.kind === "rendering" ? "조감도" : "건물 사진"}
          </button>
          <span aria-hidden="true">ㅣ</span>
          <button
            aria-pressed={mode === "floor_plan"}
            onClick={() => chooseMode("floor_plan")}
          >
            <FloorPlanIcon />
            평면도
          </button>
        </div>
        <button
          className="asset-media-expand"
          onClick={expand}
          aria-label="사진·로드뷰 크게 보기"
        >
          <Expand size={17} />
        </button>
        {available && !expanded && switchMode}
        {!expanded && mode !== "roadview" && (
          <ImagePager
            index={index}
            total={gallery.length}
            onMove={moveImage}
            showCount={false}
          />
        )}
      </div>
      {((!expanded && shown && mode !== "roadview") || onManageImages) && (
        <div className="asset-media-actions">
          {!expanded && shown && mode !== "roadview" && (
            <ReviewRecordButton
              entity="building_images"
              id={shown.id}
              label="이미지 정보 수정·이력"
            />
          )}
          {onManageImages && (
            <button className="asset-media-add" onClick={onManageImages}>
              <ImagePlus size={14} />
              사진·평면도 추가 등록
            </button>
          )}
        </div>
      )}
      {!expanded && shown && mode !== "roadview" && imageCaption && (
        <figcaption>{imageCaption}</figcaption>
      )}
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
              galleryKey(
                event,
                moveImage,
                mode !== "roadview" && gallery.length > 1,
              );
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
                <button
                  aria-pressed={mode === "floor_plan"}
                  onClick={() => chooseMode("floor_plan")}
                >
                  평면도
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
            <div className="asset-media-stage">
              {content(true)}
              {mode !== "roadview" && (
                <ImagePager
                  index={index}
                  total={gallery.length}
                  onMove={moveImage}
                />
              )}
            </div>
            {mode !== "roadview" && gallery.length > 1 && (
              <div className="asset-photo-picker" aria-label="이미지 선택">
                {gallery.map((item, i) => (
                  <button
                    key={item.id}
                    aria-pressed={item.id === shown?.id}
                    onClick={() => selectImage(item.id)}
                    aria-label={`${i + 1}번: ${item.floor_label || item.title}`}
                  >
                    <BuildingPhoto image={item} publicRead />
                  </button>
                ))}
              </div>
            )}
            {notice && (
              <p className="asset-media-notice" role="status">
                {notice}
              </p>
            )}
            {mode !== "roadview" && (
              <div className="asset-media-caption">
                <span>
                  {shown?.floor_label ||
                    shown?.title ||
                    (mode === "floor_plan"
                      ? "평면도 준비 중"
                      : "건물 사진 준비 중")}
                </span>
                {gallery.length > 1 && (
                  <div className="asset-media-pagination">
                    <button
                      aria-label="이전 사진"
                      onClick={() =>
                        selectImage(
                          gallery[(index - 1 + gallery.length) % gallery.length]
                            .id,
                        )
                      }
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <span>
                      {index + 1} / {gallery.length}
                    </span>
                    <button
                      aria-label="다음 사진"
                      onClick={() =>
                        selectImage(gallery[(index + 1) % gallery.length].id)
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
