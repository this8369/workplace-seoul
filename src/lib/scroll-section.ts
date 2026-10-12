/** Last heading above the reading line; the final section wins at the page end. */
export function activeSectionIndex(
  tops: number[],
  readingLine: number,
  atEnd = false,
) {
  if (!tops.length) return -1;
  if (atEnd) return tops.length - 1;
  let active = 0;
  for (let i = 0; i < tops.length; i++) {
    if (tops[i] > readingLine) break;
    active = i;
  }
  return active;
}
