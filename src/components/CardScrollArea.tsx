import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

export default function CardScrollArea({
  children,
  scrollRef,
  onPreview,
  previewKey,
}: {
  children: ReactNode;
  scrollRef: RefObject<HTMLDivElement | null>;
  onPreview: (id: string | null) => void;
  previewKey: string;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; scrollTop: number } | null>(null);
  const [active, setActive] = useState(false);
  const [metrics, setMetrics] = useState({
    top: 0,
    height: 0,
    travel: 0,
    max: 0,
    value: 0,
  });

  useLayoutEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    let pointer: { x: number; y: number } | null = null;
    let timer: ReturnType<typeof setTimeout>;
    let current: string | null = null;
    const publish = (id: string | null) => {
      if (id === current) return;
      current = id;
      onPreview(id);
    };
    const hitTest = () => {
      if (!pointer) return null;
      const card = document
        .elementFromPoint(pointer.x, pointer.y)
        ?.closest<HTMLElement>("[data-building-id]");
      return card && viewport.contains(card)
        ? (card.dataset.buildingId ?? null)
        : null;
    };
    const settle = (delay: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => publish(hitTest()), delay);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch" || event.buttons) return;
      pointer = { x: event.clientX, y: event.clientY };
      if (hitTest() !== current) settle(120);
    };
    const scroll = () => {
      publish(null);
      settle(180);
    };
    const leave = () => {
      pointer = null;
      clearTimeout(timer);
      publish(null);
    };
    viewport.addEventListener("pointermove", move);
    viewport.addEventListener("pointerleave", leave);
    viewport.addEventListener("scroll", scroll, { passive: true });
    onPreview(null);
    return () => {
      clearTimeout(timer);
      viewport.removeEventListener("pointermove", move);
      viewport.removeEventListener("pointerleave", leave);
      viewport.removeEventListener("scroll", scroll);
      onPreview(null);
    };
  }, [scrollRef, onPreview, previewKey]);

  useLayoutEffect(() => {
    const viewport = scrollRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    let timer: ReturnType<typeof setTimeout>;
    const measure = () => {
      const trackHeight = Math.max(0, viewport.clientHeight - 8);
      const max = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      const height = Math.min(
        trackHeight,
        Math.max(
          28,
          (trackHeight * viewport.clientHeight) /
            Math.max(1, viewport.scrollHeight),
        ),
      );
      const travel = trackHeight - height;
      const value = Math.max(0, Math.min(max, viewport.scrollTop));
      setMetrics({
        height,
        travel,
        max,
        value,
        top: max ? (value / max) * travel : 0,
      });
    };
    const onScroll = () => {
      measure();
      setActive(true);
      clearTimeout(timer);
      timer = setTimeout(() => setActive(false), 900);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(content);
    viewport.addEventListener("scroll", onScroll, { passive: true });
    measure();
    return () => {
      observer.disconnect();
      viewport.removeEventListener("scroll", onScroll);
      clearTimeout(timer);
    };
  }, [scrollRef]);

  return (
    <div className={`card-scroll-area${active ? " is-scrolling" : ""}`}>
      <div
        className="results-scroll"
        ref={scrollRef}
        id="building-card-scroll"
        tabIndex={0}
        aria-label="건물 카드 목록"
      >
        <div ref={contentRef}>{children}</div>
      </div>
      {metrics.max > 0 && (
        <div
          className="card-scroll-track"
          onWheel={(event) => {
            if (scrollRef.current) scrollRef.current.scrollTop += event.deltaY;
          }}
          onPointerDown={(event) => {
            if (
              event.target !== event.currentTarget ||
              !scrollRef.current ||
              !metrics.travel
            )
              return;
            const y =
              event.clientY -
              event.currentTarget.getBoundingClientRect().top -
              metrics.height / 2;
            scrollRef.current.scrollTop =
              Math.max(0, Math.min(1, y / metrics.travel)) * metrics.max;
          }}
        >
          <div
            className="card-scroll-thumb"
            role="scrollbar"
            aria-label="건물 목록 스크롤"
            aria-controls="building-card-scroll"
            aria-orientation="vertical"
            aria-valuemin={0}
            aria-valuemax={Math.round(metrics.max)}
            aria-valuenow={Math.round(metrics.value)}
            tabIndex={0}
            style={{
              height: metrics.height,
              transform: `translateY(${metrics.top}px)`,
            }}
            onPointerDown={(event) => {
              if (event.button !== 0 || !scrollRef.current) return;
              event.preventDefault();
              event.currentTarget.focus();
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = {
                y: event.clientY,
                scrollTop: scrollRef.current.scrollTop,
              };
            }}
            onPointerMove={(event) => {
              if (!drag.current || !scrollRef.current || !metrics.travel)
                return;
              scrollRef.current.scrollTop =
                drag.current.scrollTop +
                ((event.clientY - drag.current.y) / metrics.travel) *
                  metrics.max;
            }}
            onPointerUp={(event) => {
              drag.current = null;
              event.currentTarget.releasePointerCapture(event.pointerId);
              event.currentTarget.blur();
            }}
            onLostPointerCapture={() => {
              drag.current = null;
            }}
            onKeyDown={(event) => {
              const viewport = scrollRef.current;
              if (!viewport) return;
              const targets: Record<string, number> = {
                ArrowDown: viewport.scrollTop + 40,
                ArrowUp: viewport.scrollTop - 40,
                PageDown: viewport.scrollTop + viewport.clientHeight,
                PageUp: viewport.scrollTop - viewport.clientHeight,
                Home: 0,
                End: metrics.max,
              };
              if (event.key in targets) {
                event.preventDefault();
                viewport.scrollTop = targets[event.key];
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
