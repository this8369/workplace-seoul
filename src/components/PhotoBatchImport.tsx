import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import type { Building } from "../lib/domain";
import { safeSourceUrl } from "../lib/domain";
import { fetchBuildingImages } from "../lib/building-images";
import { supabase } from "../lib/supabase";
type BatchItem = {
  kind?: "photo" | "rendering";
  building_id: string;
  title: string;
  source_name: string;
  source_url: string;
  source_image_url: string;
  source_date: string;
  review_note: string;
  detail_base64: string;
  thumbnail_base64: string;
  focal_x?: number;
  focal_y?: number;
};
function decode(value: string) {
  if (typeof value !== "string" || value.length > 12 * 1024 * 1024)
    throw new Error("사진 파일 용량이 올바르지 않습니다.");
  const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  if (
    String.fromCharCode(...bytes.slice(0, 4)) !== "RIFF" ||
    String.fromCharCode(...bytes.slice(8, 12)) !== "WEBP"
  )
    throw new Error("WebP 사진 묶음만 가져올 수 있습니다.");
  return new Blob([bytes], { type: "image/webp" });
}
export default function PhotoBatchImport({
  buildings,
  onRefresh,
}: {
  buildings: Building[];
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  const input = useRef<HTMLInputElement>(null);
  async function importFile(file: File) {
    if (!supabase || busy) return;
    setBusy(true);
    setStatus("사진 묶음을 확인하고 있습니다.");
    let done = 0,
      skipped = 0;
    const failed: string[] = [];
    try {
      if (file.size > 120 * 1024 * 1024)
        throw new Error("묶음은 120MB 이하로 나눠 주세요.");
      const batch = JSON.parse(await file.text());
      if (
        batch.version !== 1 ||
        !Array.isArray(batch.items) ||
        batch.items.length > 400
      )
        throw new Error("사진 묶음 형식이 올바르지 않습니다.");
      const items = batch.items as BatchItem[];
      // Validate the entire manifest before beginning any writes.
      for (const item of items) {
        if (
          !buildings.some((b) => b.id === item.building_id) ||
          typeof item.title !== "string" ||
          !item.title.trim() ||
          typeof item.source_name !== "string" ||
          !safeSourceUrl(item.source_url)?.startsWith("https://") ||
          !safeSourceUrl(item.source_image_url)?.startsWith("https://")
        )
          throw new Error("건물 또는 출처 정보를 확인해 주세요.");
        decode(item.detail_base64);
        decode(item.thumbnail_base64);
      }
      const current = await fetchBuildingImages();
      for (const [index, item] of items.entries()) {
        setStatus(
          `Supabase 저장 중 ${index + 1}/${items.length} · ${item.title}`,
        );
        if (
          current.some(
            (i) => i.building_id === item.building_id && i.is_primary,
          )
        ) {
          skipped++;
          continue;
        }
        const existing = current.find(
          (i) =>
            i.building_id === item.building_id &&
            i.title === item.title &&
            i.source_url === item.source_url,
        );
        let inserted = false;
        const paths = [
          `${item.building_id}/${crypto.randomUUID()}.webp`,
          `${item.building_id}/${crypto.randomUUID()}.webp`,
        ];
        try {
          let id = existing?.id;
          if (!existing?.object_path) {
            for (const [n, bytes] of [
              item.detail_base64,
              item.thumbnail_base64,
            ].entries()) {
              const { error } = await supabase.storage
                .from("building-images")
                .upload(paths[n], decode(bytes), {
                  contentType: "image/webp",
                  upsert: false,
                  cacheControl: "3600",
                });
              if (error) throw error;
            }
            const record = {
              kind: item.kind === "rendering" ? "rendering" : "photo",
              building_id: item.building_id,
              title: item.title,
              source_name: item.source_name,
              source_url: item.source_url,
              source_image_url: item.source_image_url,
              source_date: item.source_date,
              review_note: item.review_note,
              object_path: paths[0],
              thumbnail_path: paths[1],
              focal_x: item.focal_x ?? 50,
              focal_y: item.focal_y ?? 50,
            };
            const result = existing
              ? await supabase
                  .from("building_images")
                  .update(record)
                  .eq("id", existing.id)
                  .select("id")
                  .single()
              : await supabase
                  .from("building_images")
                  .insert(record)
                  .select("id")
                  .single();
            if (result.error) throw result.error;
            inserted = true;
            id = result.data.id;
          }
          const { error } = await supabase.rpc("set_primary_building_image", {
            image_id: id,
          });
          if (error) throw error;
          done++;
        } catch {
          if (!inserted && !existing?.object_path)
            await supabase.storage.from("building-images").remove(paths);
          failed.push(item.title);
        }
      }
      await onRefresh();
      setStatus(
        `사진 ${done}개 저장 · 기존 대표 사진 ${skipped}개 유지${failed.length ? ` · 실패 ${failed.length}개: ${failed.join(", ")}. 같은 묶음을 다시 가져오면 이어서 처리합니다.` : ""}`,
      );
    } catch (e) {
      setStatus(
        e instanceof Error ? e.message : "사진 묶음을 가져오지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="photo-batch">
      <input
        ref={input}
        aria-label="사진 묶음 파일"
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importFile(file);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        <Upload size={14} />
        {busy ? "사진 저장 중…" : "사진 묶음 가져오기"}
      </button>
      {import.meta.env.DEV && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            try {
              setStatus("수집한 사진을 불러오고 있습니다.");
              const { data } = await supabase!.auth.getSession();
              const response = await fetch("/__local-photo-batch", {
                headers: {
                  Authorization: `Bearer ${data.session?.access_token || ""}`,
                },
              });
              if (!response.ok)
                throw new Error("수집한 사진을 불러오지 못했습니다.");
              await importFile(
                new File([await response.blob()], "workplace-photos.json", {
                  type: "application/json",
                }),
              );
            } catch (e) {
              setStatus(
                e instanceof Error ? e.message : "사진을 불러오지 못했습니다.",
              );
            }
          }}
        >
          수집한 사진 적용
        </button>
      )}
      {status && <p role="status">{status}</p>}
    </div>
  );
}
