import { useEffect, useRef, useState } from "react";
import { Building2 } from "lucide-react";
import { photoUrls } from "../lib/photo-urls";
import type { BuildingImage } from "../lib/building-images";
export default function BuildingPhoto({
  image,
  detail = false,
  priority = false,
}: {
  image?: BuildingImage;
  detail?: boolean;
  priority?: boolean;
}) {
  const path = detail
    ? image?.object_path
    : image?.thumbnail_path || image?.object_path;
  const host = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(priority || detail);
  const [loaded, setLoaded] = useState<{ path: string; url: string }>();
  const [retry, setRetry] = useState(0);
  const approved = image?.review_status === "approved";
  useEffect(() => {
    if (visible) return;
    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "160px" },
    );
    const target = host.current?.parentElement;
    if (target) observer.observe(target);
    return () => observer.disconnect();
  }, [visible]);
  useEffect(() => {
    if (!path || !visible) return;
    let alive = true;
    void photoUrls(approved)
      .get(path)
      .then((url) => {
        if (alive) setLoaded({ path, url });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [path, visible, approved, retry]);
  return (
    <span ref={host} className="building-photo-content">
      {loaded && loaded.path === path && image ? (
        <img
          src={loaded.url}
          alt={image.title}
          loading={priority || detail ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          style={{ objectPosition: `${image.focal_x}% ${image.focal_y}%` }}
          onError={() => {
            setLoaded(undefined);
            if (path && retry < 1) {
              photoUrls(approved).invalidate(path);
              setRetry(retry + 1);
            }
          }}
        />
      ) : (
        <Building2 size={detail ? 38 : 26} aria-hidden="true" />
      )}
    </span>
  );
}
