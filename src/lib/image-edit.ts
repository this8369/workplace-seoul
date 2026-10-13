import type { BuildingImage } from "./building-images.ts";

const editable = (image: BuildingImage) => ({
  title: image.title.trim(),
  kind: image.kind,
  floor_label:
    image.kind === "floor_plan" ? image.floor_label?.trim() || null : null,
  sort_order: image.sort_order || 0,
  source_name: image.source_name.trim(),
  source_url: image.source_url || null,
  captured_on: image.captured_on || null,
  credit: image.credit.trim(),
  license_name: image.license_name.trim(),
  rights_status: image.rights_status,
  rights_note: image.rights_note.trim(),
  review_note: image.review_note,
  focal_x: image.focal_x,
  focal_y: image.focal_y,
  zoom_percent: image.zoom_percent ?? 100,
});
const presentationFields = new Set([
  "focal_x",
  "focal_y",
  "zoom_percent",
  "sort_order",
]);

// Crop/order edits don't change the reviewed image or its publication status.
// File replacement and content changes still require a new review.
export function imageEditPatch(
  original: BuildingImage,
  draft: BuildingImage,
  replacingFile = false,
) {
  const before = editable(original),
    after = editable(draft);
  const changed = Object.entries(after).filter(
    ([key, value]) => value !== before[key as keyof typeof before],
  );
  const needsReview =
    replacingFile || changed.some(([key]) => !presentationFields.has(key));
  return {
    ...Object.fromEntries(changed),
    ...(needsReview
      ? {
          review_status: "candidate",
          is_primary: false,
          reviewed_at: null,
          reviewed_by: null,
        }
      : {}),
  };
}
export const keepPrimaryOnPublish = (
  original: BuildingImage,
  draft: BuildingImage,
) => original.is_primary && draft.kind !== "floor_plan";
