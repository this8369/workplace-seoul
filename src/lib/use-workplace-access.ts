import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  igis,
  authBridge,
  noAccess,
  readAccess,
  signOutIgis,
  type WorkplaceAccess,
} from "./igis-auth";
export function useWorkplaceAccess(
  session: Session | null,
  onError: (message: string) => void,
) {
  const [access, setAccess] = useState<WorkplaceAccess & { userId?: string }>(
    noAccess,
  );
  useEffect(() => {
    let alive = true,
      running = false;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    setAccess(noAccess);
    if (!session) return;
    async function check() {
      if (running || !alive) return;
      running = true;
      try {
        const { data, error } = await igis.auth.getSession();
        if (error) throw error;
        if (data.session)
          await authBridge("sync", data.session.access_token, {
            workplace_token: session!.access_token,
          });
        const current = await readAccess();
        if (current.linked && !data.session)
          throw Object.assign(Error("IGIS 계정으로 다시 로그인해 주세요."), {
            status: 401,
          });
        if (alive) {
          clearTimeout(expiry);
          const remaining =
            Date.parse(current.verified_until || "") - Date.now();
          if (!(remaining > 0)) setAccess(noAccess);
          else {
            setAccess({ ...current, userId: session!.user.id });
            expiry = setTimeout(() => setAccess(noAccess), remaining);
          }
        }
      } catch (error) {
        if (!alive) return;
        setAccess(noAccess);
        const status = (error as { status?: number }).status;
        if (status === 401 || status === 403) {
          await signOutIgis().catch(() => {});
          onError((error as Error).message);
        }
      } finally {
        running = false;
      }
    }
    void check();
    const interval = setInterval(() => {
      if (!document.hidden) void check();
    }, 45000);
    const focus = () => {
      if (!document.hidden) void check();
    };
    document.addEventListener("visibilitychange", focus);
    window.addEventListener("focus", focus);
    return () => {
      alive = false;
      clearTimeout(expiry);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", focus);
      window.removeEventListener("focus", focus);
    };
  }, [session, onError]);
  return session && access.userId === session.user.id ? access : noAccess;
}
