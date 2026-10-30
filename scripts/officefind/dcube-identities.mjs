// These are separate leasing assets at one street address, not renamed aliases.
export const dcubeIdentities = [
  {
    id: "32fd8815-944a-526b-88c1-aa152db6e4ac",
    name: "디큐브시티 (스페이스케이)",
    sourceName: "디큐브시티(스페이스케이)",
    path: "/신도림동360-51디큐브시티스페이스케이",
  },
  {
    id: "c319bb99-b72f-5cda-9148-0a5280c2e93f",
    name: "타임워크웨스트",
    sourceName: "타임워크웨스트",
    path: "/신도림동692타임워크웨스트",
  },
];

export function dcubeIdentityMatch(building, source) {
  const target = dcubeIdentities.find((item) => item.id === building.id);
  if (!target) return null;
  let url;
  try {
    url = new URL(source.url);
  } catch {
    return { ok: false, reason: "reviewed-source-mismatch" };
  }
  return {
    ok:
      url.origin === "https://officefind.co.kr" &&
      decodeURIComponent(url.pathname) === target.path &&
      source.name === target.sourceName,
    reason: "reviewed-distinct-leasing-asset",
  };
}
