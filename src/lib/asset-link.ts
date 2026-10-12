export function sharedAssetId(search: string): string | null {
  const id = new URLSearchParams(search).get("asset");
  return id && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)
    ? id
    : null;
}

export function assetShareUrl(href: string, id: string): string {
  const url = new URL(href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("asset", id);
  return url.toString();
}
