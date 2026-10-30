import type { Building } from "./domain.ts";

const tabs = [
  "개요",
  "시장 임대",
  "임차기업",
  "토지",
  "건축물대장",
  "거래 이력",
  "개발·변경 이력",
  "주변",
] as const;
export type AssetTab = (typeof tabs)[number];
export function assetDetailTabs(): readonly AssetTab[] {
  return tabs;
}

// A sibling's private affiliation must never enable this building's panel.
export function hasIgisDetails(building: Pick<Building, "is_igis">): boolean {
  return building.is_igis === true;
}
