import type { Building } from "./domain.ts";
import type { BuildingComplex, BuildingTower } from "./building-towers.ts";

export type PublicRequestScope = <T>(
  key: string,
  load: () => Promise<T>,
) => Promise<T>;
export type MemberAssetScope = {
  complex: BuildingComplex;
  members: readonly Building[];
  towers: readonly BuildingTower[];
  read: PublicRequestScope;
};
// One open complex/revision owns this cache. Only public reads belong here;
// authenticated master corrections always use a fresh authorized request.
export function createMemberAssetScope(
  seed: Omit<MemberAssetScope, "read">,
): MemberAssetScope {
  const requests = new Map<string, Promise<unknown>>();
  const read: PublicRequestScope = <T>(key: string, load: () => Promise<T>) => {
    const existing = requests.get(key);
    if (existing) return existing as Promise<T>;
    const request = Promise.resolve().then(load);
    requests.set(key, request);
    void request.catch(() => {
      if (requests.get(key) === request) requests.delete(key);
    });
    return request;
  };
  return { ...seed, read };
}
