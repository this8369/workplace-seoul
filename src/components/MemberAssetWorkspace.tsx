import { useEffect, useState } from "react";
import { DataReviewProvider } from "./DataReview";
import { X } from "lucide-react";
import { AssetWorkspace } from "./AssetWorkspace";
import type { Building } from "../lib/domain";
import type { Catalog } from "../lib/catalog";
import { fetchMemberAsset } from "../lib/member-details";

// Mounted only while details.read is valid; keyed by account and selected asset.
// No private result is merged into the public catalog or browser storage.
export default function MemberAssetWorkspace({
  building,
  canReadTransactions,
  onClose,
  onBuilding,
  saved,
  onSave,
  onManageImages,
}: {
  building: Building;
  canReadTransactions: boolean;
  onClose: () => void;
  onBuilding: (id: string) => void;
  saved: boolean;
  onSave: () => void;
  onManageImages?: () => void;
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setFailed(false);

    void fetchMemberAsset(building.id, canReadTransactions)
      .then((data) => {
        if (alive) setCatalog(data);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [building.id, canReadTransactions, attempt]);
  if (!catalog)
    return (
      <div
        className="asset-popup"
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
              ? "상세정보를 불러오지 못했습니다. 로그인 상태와 접근 권한을 확인해 주세요."
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
      onSaved={() => setAttempt((n) => n + 1)}
    >
      <AssetWorkspace
        building={catalog.buildings[0]}
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
