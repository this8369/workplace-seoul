import { useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import { supabase } from "../lib/supabase";

type Alert = {
  building_id: string;
  building_name: string;
  latest_id: string;
  changes: number;
};
export default function AssetNotifications({
  onOpen,
}: {
  onOpen: (id: string) => void;
}) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true,
      running = false;
    async function refresh() {
      if (!supabase || running || document.hidden) return;
      running = true;
      try {
        const { data, error } = await supabase.rpc("asset_alert_feed");
        if (alive) setAlerts(error ? [] : ((data || []) as Alert[]));
      } finally {
        running = false;
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 60000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("asset-alerts-changed", refresh);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("asset-alerts-changed", refresh);
    };
  }, []);
  const alert = alerts[0];
  async function read(open: boolean) {
    if (!supabase || !alert) return;
    if (open) onOpen(alert.building_id);
    const { error } = await supabase.rpc("read_asset_alert", {
      asset_key: alert.building_id,
      through_id: alert.latest_id,
    });
    if (error) {
      setError("알림 확인 상태를 저장하지 못했습니다. 다시 시도해 주세요.");
      return;
    }
    setError("");
    setAlerts((current) =>
      current.filter((item) => item.building_id !== alert.building_id),
    );
  }
  if (!alert) return null;
  return (
    <aside
      className="asset-change-notice"
      aria-label="자산정보 변경 알림"
      aria-live="polite"
    >
      <BellRing size={20} />
      <button type="button" onClick={() => void read(true)}>
        <strong>{alert.building_name}</strong>
        <span>
          자산정보가 변경되었습니다
          {alerts.length > 1 ? ` · 외 ${alerts.length - 1}개 자산` : ""}
        </span>
      </button>
      <button
        type="button"
        aria-label="변경 알림 확인 완료"
        onClick={() => void read(false)}
      >
        <X size={18} />
      </button>
      {error && <small role="status">{error}</small>}
    </aside>
  );
}
