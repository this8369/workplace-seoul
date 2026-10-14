import { useEffect, useState } from "react";
import type { Building } from "../lib/domain";
import { supabase } from "../lib/supabase";
import { assetShareUrl } from "../lib/asset-link";

// Shared optical bounds keep the three outline icons aligned at small sizes.
function ActionIcon({
  kind,
  active = false,
}: {
  kind: "save" | "alert" | "share";
  active?: boolean;
}) {
  return (
    <svg
      className="asset-action-icon"
      data-kind={kind}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {kind === "save" && (
        <path
          fill={active ? "currentColor" : "none"}
          d="m16 3 4.1 8.7 9.4 1.3-6.8 6.6 1.6 9.4-8.3-4.5-8.3 4.5 1.6-9.4L2.5 13l9.4-1.3Z"
        />
      )}
      {kind === "alert" && (
        <>
          <path d="M22 10.5a7.5 7.5 0 0 0-15 0v6.7c0 2.7-1 4.3-2.5 5.8h19" />
          <path d="M11 26a3.5 3.5 0 0 0 7 0" />
          {active ? (
            <path d="m21 16.5 2.5 2.5 5-5" />
          ) : (
            <path d="M24.5 12.5v9M20 17h9" />
          )}
        </>
      )}
      {kind === "share" && (
        <path d="M3.5 27.5c.7-10.1 7-16.7 15-16.7V4L29 15 18.5 25v-6.8c-6.2 0-11 3-15 9.3Z" />
      )}
    </svg>
  );
}

export default function AssetActions({
  building,
  saved,
  onSave,
  canPersonalize = true,
  onRequireLogin,
}: {
  building: Building;
  saved: boolean;
  onSave: () => void;
  canPersonalize?: boolean;
  onRequireLogin?: () => void;
}) {
  const [alert, setAlert] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [manualLink, setManualLink] = useState("");
  useEffect(() => {
    let alive = true;
    if (!canPersonalize) {
      setBusy(false);
      setAlert(false);
      return;
    }
    setBusy(true);
    void supabase
      ?.rpc("asset_alert_state", { asset_key: building.id })
      .then(({ data, error }) => {
        if (!alive) return;
        if (!error) setAlert(data === true);
        setBusy(false);
      });
    if (!supabase) setBusy(false);
    return () => {
      alive = false;
    };
  }, [building.id, canPersonalize]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 5000);
    return () => clearTimeout(timer);
  }, [message]);
  async function toggleAlert() {
    if (!canPersonalize) {
      onRequireLogin?.();
      return;
    }
    if (!supabase || busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("set_asset_alert", {
      asset_key: building.id,
      enabled: !alert,
    });
    setBusy(false);
    if (error) {
      setMessage("알림 설정을 저장하지 못했습니다. 다시 시도해 주세요.");
      return;
    }
    setAlert(data === true);
    setMessage(
      data
        ? "자산정보가 변경되면 사이트에서 알려드립니다."
        : "자산정보 변경 알림을 해제했습니다.",
    );
    window.dispatchEvent(new Event("asset-alerts-changed"));
  }
  async function share() {
    const url = assetShareUrl(location.href, building.id);
    setManualLink("");
    try {
      if (navigator.share) {
        await navigator.share({ title: building.name, url });
        return;
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setMessage("자산 링크를 복사했습니다.");
    } catch {
      setManualLink(url);
      setMessage("아래 링크를 복사해 보내 주세요.");
    }
  }
  return (
    <div className="asset-actions">
      <button
        type="button"
        className="asset-action"
        aria-label={saved ? "저장 해제" : "자산 저장"}
        title={saved ? "저장 해제" : "저장"}
        aria-pressed={saved}
        onClick={onSave}
      >
        <ActionIcon kind="save" active={saved} />
      </button>
      <button
        type="button"
        className="asset-action"
        disabled={busy}
        aria-pressed={alert}
        aria-label={
          alert ? "자산정보 변경 알림 해제" : "자산정보 변경 알림 설정"
        }
        title={
          alert
            ? "변경 알림 켜짐 · 클릭하여 해제"
            : "자산정보 변경 시 사이트 내 알림"
        }
        onClick={() => void toggleAlert()}
      >
        <ActionIcon kind="alert" active={alert} />
      </button>
      <button
        type="button"
        className="asset-action"
        aria-label="자산 보내기"
        title="보내기"
        onClick={() => void share()}
      >
        <ActionIcon kind="share" />
      </button>
      {(message || manualLink) && (
        <div className="asset-action-message" role="status">
          {message}
          {manualLink && (
            <input
              aria-label="보낼 자산 링크"
              readOnly
              value={manualLink}
              onFocus={(event) => event.target.select()}
            />
          )}
        </div>
      )}
    </div>
  );
}
