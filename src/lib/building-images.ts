import { supabase } from "./supabase";
export type BuildingImage = {
  id: string;
  building_id: string;
  title: string;
  kind: "photo" | "rendering";
  source_name: string;
  source_url: string | null;
  source_image_url: string | null;
  source_date: string | null;
  captured_on: string | null;
  credit: string;
  license_name: string;
  license_url: string | null;
  rights_status: "unconfirmed" | "cleared" | "restricted";
  rights_note: string;
  review_status: "candidate" | "approved" | "rejected";
  review_note: string;
  object_path: string | null;
  thumbnail_path: string | null;
  focal_x: number;
  focal_y: number;
  is_primary: boolean;
};
export async function fetchBuildingImages(): Promise<BuildingImage[]> {
  if (!supabase) return [];
  const rows: BuildingImage[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase
      .from("building_images")
      .select("*")
      .order("id")
      .range(from, from + 499);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}
export function primaryImage(images: BuildingImage[], buildingId: string) {
  return images.find(
    (i) =>
      i.building_id === buildingId &&
      i.is_primary &&
      i.review_status === "approved",
  );
}
/** Re-encode on device: preserves orientation, strips EXIF, never enlarges originals. */
export async function prepareWebp(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("JPG, PNG, WebP 사진을 선택해 주세요.");
  if (file.size > 25 * 1024 * 1024)
    throw new Error("원본 사진은 25MB 이하로 선택해 주세요.");
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  try {
    if (bitmap.width * bitmap.height > 60000000)
      throw new Error("사진 해상도를 6,000만 화소 이하로 줄여 주세요.");
    async function encode(max: number, quality: number) {
      const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("사진 변환을 시작하지 못했습니다.");
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", quality),
      );
      if (!blob || blob.type !== "image/webp")
        throw new Error("이 브라우저에서 WebP 변환을 지원하지 않습니다.");
      return blob;
    }
    return {
      detail: await encode(1600, 0.82),
      thumbnail: await encode(480, 0.78),
    };
  } finally {
    bitmap.close();
  }
}
