import { lazy, Suspense, useEffect, useState } from "react";
import { DataReviewProvider } from "./DataReview";
import { X } from "lucide-react";
import { AssetWorkspace } from "./AssetWorkspace";
import type { Building } from "../lib/domain";
import type { Catalog } from "../lib/catalog";
import { fetchMemberAsset } from "../lib/member-details";
import type { MemberAssetScope } from "../lib/member-asset-scope";

import type { BuildingComplex } from "../lib/building-towers";
const ComplexAssetWorkspace = lazy(() => import("./ComplexAssetWorkspace"));

// General detail is public; IGIS content and editing retain account permissions.
// No private result is merged into the public catalog or browser storage.
export type MemberWorkspaceProps = {
  building: Building;
  canReadTransactions: boolean;
  canReadIgis?: boolean;
  onRequireLogin?: () => void;
  onClose: () => void;
  onBuilding: (id: string) => void;
  saved: boolean;
  onSave: () => void;
  onManageImages?: () => void;
  complexes?: BuildingComplex[];
  single?: boolean;
  embedded?: boolean;
  sharedOverview?: React.ReactNode;
  loadScope?: MemberAssetScope;
  informationRevision?: number;
  onInformationSaved?: () => void;
  onActiveBuilding?: (building: Building, replace?: boolean) => void;
  onSaveBuilding?: (id: string) => void;
  savedIds?: Set<string>;
  onManageBuildingImages?: (id: string) => void;
};
export default function MemberAssetWorkspace(props: MemberWorkspaceProps) {
  const complex =
    !props.single &&
    props.complexes?.find((c) => c.id === props.building.complex_id);
  if (complex)
    return (
      <Suspense fallback={null}>
        <ComplexAssetWorkspace {...props} complex={complex} />
      </Suspense>
    );
  return <SingleAssetWorkspace {...props} />;
}
function SingleAssetWorkspace({
  building,
  canReadTransactions,
  canReadIgis = false,
  onRequireLogin,
  onClose,
  onBuilding,
  saved,
  onSave,
  onManageImages,
  embedded,
  sharedOverview,
  loadScope,
  informationRevision = 0,
  onInformationSaved,
}: {
  building: Building;
  canReadTransactions: boolean;
  canReadIgis?: boolean;
  onRequireLogin?: () => void;
  onClose: () => void;
  onBuilding: (id: string) => void;
  saved: boolean;
  onSave: () => void;
  onManageImages?: () => void;
  embedded?: boolean;
  sharedOverview?: React.ReactNode;
  loadScope?: MemberAssetScope;
  informationRevision?: number;
  onInformationSaved?: () => void;
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setFailed(false);

    void fetchMemberAsset(
      building.id,
      canReadTransactions,
      true,
      canReadIgis,
      loadScope,
    )
      .then((data) => {
        if (alive) setCatalog(data);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [
    building.id,
    canReadTransactions,
    canReadIgis,
    attempt,
    informationRevision,
    loadScope,
  ]);
  if (!catalog)
    return (
      <div
        className={`asset-popup${embedded ? " asset-popup-embedded" : ""}`}
        role="dialog"
        aria-label={`${building.name} 자산 상세`}
      >
        <div className="asset-popup-toolbar">
          <span>{building.name}</span>
          <button
            className="asset-popup-close"
            onClick={onClose}
            aria-label="상세 닫기"
          >
            <X size={21} />
          </button>
        </div>
        <div className="empty" role="status">
          <p>
            {failed
              ? "상세정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
              : "상세정보를 불러오고 있습니다."}
          </p>
          {failed && (
            <button onClick={() => setAttempt((n) => n + 1)}>다시 시도</button>
          )}
        </div>
      </div>
    );
  return (
    <DataReviewProvider
      assetId={building.id}
      location={building}
      enabled={canReadIgis}
      onRequireLogin={onRequireLogin}
      externalVersion={informationRevision}
      onSaved={() => {
        setAttempt((n) => n + 1);
        onInformationSaved?.();
      }}
    >
      <AssetWorkspace
        canReadIgis={canReadIgis}
        onRequireLogin={onRequireLogin}
        embedded={embedded}
        sharedOverview={sharedOverview}
        building={{
          ...catalog.buildings[0],
          region: building.region,
        }}
        catalog={catalog}
        onClose={onClose}
        onBuilding={onBuilding}
        saved={saved}
        onSave={onSave}
        onManageImages={onManageImages}
      />
    </DataReviewProvider>
  );
}
