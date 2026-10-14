import type { Building } from "./domain.ts";

const tabs = [
  "개요",
  "이지스",
  "토지",
  "건축물대장",
  "시장 임대",
  "임차기업",
  "거래 이력",
  "개발·변경 이력",
  "주변",
] as const;
export type AssetTab = (typeof tabs)[number];
const generalTabs = tabs.filter((tab) => tab !== "이지스");

// The published per-building flag is authoritative, never a sibling or list group.
export function assetDetailTabs(
  building: Pick<Building, "is_igis">,
): readonly AssetTab[] {
  return building.is_igis === true ? tabs : generalTabs;
}
