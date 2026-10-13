import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleHelp, X } from "lucide-react";
import "./LoadDensityHelp.css";

export function LoadDensityExplanation() {
  return (
    <div className="load-density-explanation">
      <p>
        평당부하밀도는 연면적 1평당 계약된 전력 용량을 나타내는 계산값입니다.
      </p>
      <p className="load-density-formula">
        <b>계산 방법</b>
        <span>
          자산계약수전량(MW) × 1,000,000
          <br />÷ 연면적(평) = 평당부하밀도(W/평)
        </span>
      </p>
      <p>
        1 MW는 1,000,000 W이며, 연면적은 1㎡ = 0.3025평으로 환산합니다. 수전량
        또는 유효한 연면적이 없으면 미확인으로 표시합니다.
      </p>
      <p>
        실제 전력 사용량이나 임차공간별 공급 용량을 뜻하지 않습니다. 단지 전체
        수전량과 개별 동 면적처럼 범위가 다른 값은 함께 계산하지 않습니다.
      </p>
    </div>
  );
}

export default function LoadDensityHelp() {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = () => {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  };
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!trigger.current || !panel.current) return;
      const a = trigger.current.getBoundingClientRect(),
        p = panel.current.getBoundingClientRect();
      const narrow = window.innerWidth < 600;
      const left = narrow
        ? Math.max(12, Math.min(a.left, window.innerWidth - p.width - 12))
        : a.right + p.width + 12 <= window.innerWidth - 12
          ? a.right + 12
          : Math.max(12, a.left - p.width - 12);
      const top = Math.max(
        12,
        Math.min(
          narrow ? a.bottom + 10 : a.top - 12,
          window.innerHeight - p.height - 12,
        ),
      );
      setPosition({ left, top });
    };
    place();
    closeButton.current?.focus({ preventScroll: true });
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (
        !panel.current?.contains(e.target as Node) &&
        !trigger.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape, true);
    };
  }, [open]);
  return (
    <>
      <button
        ref={trigger}
        className="load-density-help"
        aria-label="평당부하밀도 계산 기준 안내"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <CircleHelp size={14} />
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            id={id}
            className="load-density-popover"
            style={position}
            role="dialog"
            aria-modal="false"
            aria-labelledby={`${id}-title`}
          >
            <div className="load-density-heading">
              <h2 id={`${id}-title`}>평당부하밀도 안내</h2>
              <button
                ref={closeButton}
                onClick={close}
                aria-label="계산 기준 안내 닫기"
              >
                <X size={18} />
              </button>
            </div>
            <LoadDensityExplanation />
          </div>,
          document.body,
        )}
    </>
  );
}
