import type { KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import "./ImagePager.css";

export function galleryKey(
  event: KeyboardEvent,
  move: (step: -1 | 1) => void,
  enabled: boolean,
) {
  if (
    !enabled ||
    event.defaultPrevented ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  )
    return;
  if (
    (event.target as HTMLElement).closest(
      'input,textarea,select,[contenteditable="true"]',
    )
  )
    return;
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  event.stopPropagation();
  move(event.key === "ArrowLeft" ? -1 : 1);
}

export default function ImagePager({
  index,
  total,
  onMove,
  disabled = false,
  showCount = true,
}: {
  index: number;
  total: number;
  onMove: (step: -1 | 1) => void;
  disabled?: boolean;
  showCount?: boolean;
}) {
  if (total < 2) return null;
  return (
    <div className="image-pager" role="group" aria-label="이미지 넘기기">
      <button
        className="image-pager-prev"
        type="button"
        disabled={disabled}
        aria-label="이전 이미지"
        title="이전 이미지 (←)"
        onClick={() => onMove(-1)}
      >
        <ChevronLeft size={21} />
      </button>
      {showCount && <span
        className="image-pager-count"
        role="status"
        aria-label={`전체 ${total}장 중 ${index + 1}번째 이미지`}
      >
        {index + 1} / {total}
      </span>}
      <button
        className="image-pager-next"
        type="button"
        disabled={disabled}
        aria-label="다음 이미지"
        title="다음 이미지 (→)"
        onClick={() => onMove(1)}
      >
        <ChevronRight size={21} />
      </button>
    </div>
  );
}
