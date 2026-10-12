import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { activeSectionIndex } from "../lib/scroll-section";

export function useScrollSections<T extends string>(
  page: RefObject<HTMLElement | null>,
  names: readonly T[],
) {
  const [active, setActive] = useState<T>(names[0]);
  const [loaded, setLoaded] = useState<readonly T[]>([names[0]]);
  const anchor = useRef<T | null>(null);
  const load = useCallback((name: T) => {
    setLoaded((current) =>
      current.includes(name) ? current : [...current, name],
    );
  }, []);
  const align = useCallback(
    (name: T) => {
      const root = page.current;
      if (!root) return;
      const section = Array.from(
        root.querySelectorAll<HTMLElement>("[data-asset-section]"),
      ).find((element) => element.dataset.assetSection === name);
      const nav = root.querySelector<HTMLElement>(".asset-tabs");
      if (!section || !nav) return;
      const top =
        root.scrollTop +
        section.getBoundingClientRect().top -
        root.getBoundingClientRect().top -
        nav.offsetHeight -
        12;
      root.scrollTo({ top: Math.max(0, top), behavior: "instant" });
    },
    [page],
  );
  const goTo = useCallback(
    (name: T) => {
      anchor.current = name;
      load(name);
      setActive(name);
      align(name);
    },
    [align, load],
  );

  useEffect(() => {
    const root = page.current;
    if (!root) return;
    const nav = root.querySelector<HTMLElement>(".asset-tabs");
    const sections = Array.from(
      root.querySelectorAll<HTMLElement>("[data-asset-section]"),
    );
    let frame = 0;
    const update = () => {
      frame = 0;
      const line =
        root.getBoundingClientRect().top + (nav?.offsetHeight ?? 0) + 13;
      const atEnd =
        root.scrollTop > 0 &&
        root.scrollHeight - root.scrollTop - root.clientHeight <= 2;
      const index = activeSectionIndex(
        sections.map((element) => element.getBoundingClientRect().top),
        line,
        atEnd,
      );
      if (index >= 0) setActive(anchor.current ?? names[index]);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const release = () => {
      anchor.current = null;
    };
    const resize = new ResizeObserver(() => {
      if (anchor.current) align(anchor.current);
      schedule();
    });
    resize.observe(root);
    if (nav) resize.observe(nav);
    sections.forEach((section) => resize.observe(section));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            load((entry.target as HTMLElement).dataset.assetSection as T);
            observer.unobserve(entry.target);
          }
        });
      },
      { root, rootMargin: "240px 0px" },
    );
    sections.forEach((section) => observer.observe(section));
    root.addEventListener("scroll", schedule, { passive: true });
    root.addEventListener("wheel", release, { passive: true });
    root.addEventListener("touchstart", release, { passive: true });
    root.addEventListener("pointerdown", release);
    root.addEventListener("keydown", release);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      observer.disconnect();
      root.removeEventListener("scroll", schedule);
      root.removeEventListener("wheel", release);
      root.removeEventListener("touchstart", release);
      root.removeEventListener("pointerdown", release);
      root.removeEventListener("keydown", release);
    };
  }, [page, names, align, load]);

  useEffect(() => {
    const nav = page.current?.querySelector<HTMLElement>(".asset-tabs");
    const button = nav?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!nav || !button) return;
    const viewport = nav.getBoundingClientRect(),
      target = button.getBoundingClientRect();
    if (target.left < viewport.left + 8)
      nav.scrollLeft -= viewport.left + 8 - target.left;
    else if (target.right > viewport.right - 8)
      nav.scrollLeft += target.right - viewport.right + 8;
  }, [active, page]);
  return { active, loaded, goTo };
}
