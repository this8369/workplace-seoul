import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import type { BuildingImage } from "../lib/building-images";
export default function BuildingPhoto({
  image,
  detail = false,
}: {
  image?: BuildingImage;
  detail?: boolean;
}) {
  const path = detail
    ? image?.object_path
    : image?.thumbnail_path || image?.object_path;
  const [url, setUrl] = useState<string>();
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    setUrl(undefined);
    if (!path || !supabase) return;
    const refresh = async () => {
      const { data, error } = await supabase!.storage
        .from("building-images")
        .createSignedUrl(path, 3600);
      if (alive && !error) setUrl(data.signedUrl);
    };
    void refresh();
    const timer = window.setInterval(refresh, 50 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [path, retry]);
  if (!url || !image)
    return <Building2 size={detail ? 38 : 26} aria-hidden="true" />;
  return (
    <img
      src={url}
      alt={image.title}
      loading="lazy"
      decoding="async"
      style={{ objectPosition: `${image.focal_x}% ${image.focal_y}%` }}
      onError={() => {
        setUrl(undefined);
        if (retry < 1) setRetry(retry + 1);
      }}
    />
  );
}
