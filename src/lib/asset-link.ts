export function sharedAssetId(search: string): string | null {
  const id = new URLSearchParams(search).get("asset");
  return id && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)
    ? id.toLowerCase()
    : null;
}

export function assetShareUrl(href: string, id: string): string {
  const url = new URL(href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("asset", id);
  return url.toString();
}

// Navigation retains the user's search, while share URLs remain filter-free.
export function assetNavigationUrl(href: string, id: string | null): string {
  const url = new URL(href);
  if (id) url.searchParams.set("asset", id);
  else url.searchParams.delete("asset");
  return url.toString();
}
