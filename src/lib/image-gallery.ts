export function adjacentImageId<T extends { id: string }>(
  images: readonly T[],
  current: string | undefined,
  step: -1 | 1,
): string | undefined {
  if (!images.length) return undefined;
  const index = Math.max(
    0,
    images.findIndex((image) => image.id === current),
  );
  return images[(index + step + images.length) % images.length].id;
}
