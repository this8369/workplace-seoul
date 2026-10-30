import {
  createContext,
  lazy,
  Suspense,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ArrowUpRight, LockKeyhole, RotateCw, X } from "lucide-react";
import type { Building } from "../lib/domain";
import { hasIgisDetails } from "../lib/asset-detail-access";
import { AreaUnitProvider, useAreaUnit } from "./AreaUnit";
import { DataReviewProvider } from "./DataReview";
import "./IgisDetailLayout.css";

const IgisAssetPanel = lazy(() => import("./IgisAssetPanel"));
const IgisOperationsPanel = lazy(() => import("./IgisOperationsPanel"));
const IgisDetailContext = createContext<{
  buildingId?: string;
  open: (building: Building, trigger: HTMLButtonElement) => void;
} | null>(null);

export function IgisDetailButton({ building }: { building: Building }) {
  const panel = useContext(IgisDetailContext);
  if (!hasIgisDetails(building) || !panel) return null;
  return (
    <button
      type="button"
      className="igis-detail-trigger"
      data-igis-building={building.id}
      aria-label={`${building.name} 이지스 정보 열기`}
      aria-expanded={panel.buildingId === building.id}
      onClick={(event) => panel.open(building, event.currentTarget)}
    >
      이지스 <ArrowUpRight size={15} aria-hidden="true" />
    </button>
  );
}

export default function IgisDetailLayout({
  building,
  canReadIgis = false,
  onRequireLogin,
  informationRevision,
  onInformationSaved,
  children,
}: {
  building: Building;
  canReadIgis?: boolean;
  onRequireLogin?: () => void;
  informationRevision?: number;
  onInformationSaved?: () => void;
  children: ReactNode;
}) {
  const [mobile, setMobile] = useState(
    () => window.matchMedia("(max-width: 900px)").matches,
  );
  const [panel, setPanel] = useState<{ building: Building; open: boolean }>();
  const trigger = useRef<HTMLButtonElement | null>(null);
  const focusPanel = useRef(false);
  const side = useRef<HTMLElement>(null);
  const layout = useRef<HTMLDivElement>(null);
  const currentPanel = panel?.building.id === building.id ? panel : undefined;
  const target = currentPanel
    ? {
        ...currentPanel.building,
        ...building,
        is_igis: building.is_igis ?? currentPanel.building.is_igis,
      }
    : building;
  const visible =
    hasIgisDetails(target) && (currentPanel?.open ?? (!mobile && canReadIgis));
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const update = () => {
      setMobile(mq.matches);
      setPanel({ building, open: false });
    };
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [building.id]);
  useEffect(() => {
    if (visible && focusPanel.current) {
      side.current
        ?.querySelector<HTMLButtonElement>(".igis-panel-close")
        ?.focus({ preventScroll: true });
      if (!mobile)
        side.current?.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: "smooth",
        });
      focusPanel.current = false;
    }
  }, [visible, target.id, mobile]);
  function close() {
    setPanel({ building: target, open: false });
    layout.current?.scrollTo({ left: 0 });
    requestAnimationFrame(() => {
      const button = trigger.current?.isConnected
        ? trigger.current
        : layout.current?.querySelector<HTMLButtonElement>(
            `.igis-detail-trigger[data-igis-building="${target.id}"]`,
          );
      button?.focus({ preventScroll: true });
    });
  }
  return (
    <IgisDetailContext.Provider
      value={{
        buildingId: visible ? target.id : undefined,
        open: (next, button) => {
          trigger.current = button;
          focusPanel.current = true;
          setPanel({ building: next, open: true });
          if (!canReadIgis) onRequireLogin?.();
        },
      }}
    >
      <div
        ref={layout}
        className={`asset-detail-layout${visible ? " has-igis-panel" : ""}`}
      >
        <div
          className="asset-detail-main"
          inert={mobile && visible ? true : undefined}
        >
          {children}
        </div>
        {visible && (
          <AreaUnitProvider key={target.id}>
            <IgisSidePanelFrame
              building={target}
              mobile={mobile}
              onClose={close}
              panelRef={side}
            >
              {canReadIgis ? (
                <DataReviewProvider
                  key={target.id}
                  assetId={target.id}
                  location={target}
                  enabled
                  externalVersion={informationRevision}
                  onSaved={onInformationSaved}
                >
                  <Suspense
                    fallback={
                      <div className="igis-panel-status" role="status">
                        이지스 정보를 불러오고 있습니다.
                      </div>
                    }
                  >
                    <IgisAssetPanel
                      buildingId={target.igis_source_building_id || target.id}
                    />
                    <IgisOperationsPanel
                      buildingId={target.igis_source_building_id || target.id}
                    />
                  </Suspense>
                </DataReviewProvider>
              ) : (
                <div className="igis-panel-locked">
                  <LockKeyhole size={28} aria-hidden="true" />
                  <h3>로그인이 필요합니다</h3>
                  <button
                    type="button"
                    className="primary"
                    onClick={onRequireLogin}
                  >
                    로그인하고 보기
                  </button>
                </div>
              )}
            </IgisSidePanelFrame>
          </AreaUnitProvider>
        )}
      </div>
    </IgisDetailContext.Provider>
  );
}

export function IgisSidePanelFrame({
  building,
  mobile,
  onClose,
  panelRef,
  children,
}: {
  building: Pick<Building, "name">;
  mobile: boolean;
  onClose: () => void;
  panelRef?: React.Ref<HTMLElement>;
  children: ReactNode;
}) {
  const title = useId();
  const { unit, setUnit } = useAreaUnit();
  return (
    <aside
      ref={panelRef}
      className="igis-side-panel"
      role={mobile ? "dialog" : "complementary"}
      aria-modal={mobile ? true : undefined}
      aria-labelledby={title}
      onKeyDown={(event) => {
        if (
          mobile &&
          event.key === "Tab" &&
          !(event.target as HTMLElement).closest("dialog")
        ) {
          const controls = [
            ...event.currentTarget.querySelectorAll<HTMLElement>(
              'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]',
            ),
          ].filter((control) => control.getClientRects().length > 0);
          const first = controls[0],
            last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
        if (
          event.key === "Escape" &&
          !event.defaultPrevented &&
          !(event.target as HTMLElement).closest("dialog")
        ) {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="igis-panel-header">
        <div className="igis-panel-heading">
          <span className="igis-panel-mark">IGIS</span>
          <h2 id={title}>이지스</h2>
        </div>
        <div className="igis-panel-tools">
          <button
            type="button"
            className="igis-panel-unit"
            onClick={() => setUnit(unit === "평" ? "m²" : "평")}
            aria-label="이지스 정보 면적 단위 전환"
          >
            <RotateCw size={13} />
            {unit === "평" ? "m²" : "평"}
          </button>
          <button
            type="button"
            className="asset-popup-close igis-panel-close"
            aria-label="이지스 정보 닫기"
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </div>
      </header>
      <div className="igis-panel-scroll">
        <div className="igis-panel-asset-name">{building.name}</div>
        {children}
      </div>
    </aside>
  );
}
