import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import {
  createAccessMonitor,
  type AccessSnapshot,
} from "./workplace-access-monitor";
import {
  igis,
  authBridge,
  noAccess,
  readAccess,
  signOutIgis,
} from "./igis-auth";
export function useWorkplaceAccess(
  session: Session | null,
  onError: (message: string) => void,
) {
  const userId = session?.user.id;
  const [state, setState] = useState<AccessSnapshot & { userId?: string }>({
    status: "checking",
    access: noAccess,
  });
  const refresh = useRef<(() => Promise<void>) | undefined>(undefined);
  useEffect(() => {
    if (!userId || !supabase) {
      setState({ status: "checking", access: noAccess });
      return;
    }
    let alive = true;
    const client = supabase;
    const monitor = createAccessMonitor({
      visible: () => !document.hidden,
      publish: (snapshot) => setState({ ...snapshot, userId }),
      onDenied: (error) => {
        void signOutIgis().catch(() => {});
        onError(error.message);
      },
      verify: async () => {
        // Both SDKs finish any pending refresh before returning their latest JWT.
        // Never use the token captured when this account first mounted.
        const [source, workplace] = await Promise.all([
          igis.auth.getSession(),
          client.auth.getSession(),
        ]);
        if (source.error) throw source.error;
        if (workplace.error) throw workplace.error;
        if (!alive || workplace.data.session?.user.id !== userId)
          throw Error("로그인 계정이 변경되었습니다.");
        if (source.data.session)
          await authBridge("sync", source.data.session.access_token, {
            workplace_token: workplace.data.session.access_token,
          });
        if (!alive) throw Error("인증 확인이 종료되었습니다.");
        const current = await readAccess();
        if (current.linked && !source.data.session)
          throw Object.assign(Error("IGIS 계정으로 다시 로그인해 주세요."), {
            status: 401,
          });
        return current;
      },
    });
    refresh.current = monitor.refresh;
    void monitor.refresh();
    const interval = setInterval(() => {
      if (!document.hidden) void monitor.refresh();
    }, 45000);
    const focus = () => {
      if (!document.hidden) void monitor.refresh();
    };
    document.addEventListener("visibilitychange", focus);
    window.addEventListener("focus", focus);
    window.addEventListener("online", focus);
    return () => {
      alive = false;
      refresh.current = undefined;
      monitor.dispose();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", focus);
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", focus);
    };
  }, [userId, onError]);
  useEffect(() => {
    // TOKEN_REFRESHED/SIGNED_IN can emit a new Session for the same account.
    // Revalidate without tearing down its current, still-valid permissions.
    if (session) void refresh.current?.();
  }, [session?.access_token]);
  const current = userId && state.userId === userId ? state : null;
  const valid =
    current && Date.parse(current.access.verified_until || "") > Date.now();
  return {
    ...(valid ? current.access : noAccess),
    status: !userId
      ? "signed-out"
      : current?.status === "ready" && !valid
        ? "checking"
        : (current?.status ?? "checking"),
  };
}
