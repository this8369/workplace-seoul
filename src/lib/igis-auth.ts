import { createClient, type Session } from "@supabase/supabase-js";
import { IGIS_URL, IGIS_PUBLIC_KEY } from "./igis-config";
import { supabase } from "./supabase";
import { requestIgisBridge } from "./igis-bridge-request";
export const recoveryRoute =
  new URLSearchParams(location.search).get("igis-recovery") === "1";
export const igis = createClient(IGIS_URL, IGIS_PUBLIC_KEY, {
  auth: {
    storageKey: "workplace-igis-auth",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: "implicit",
  },
});
export type WorkplaceAccess = {
  display_name: string | null;
  linked?: boolean;
  permissions: string[];
};
export const noAccess: WorkplaceAccess = {
  display_name: null,
  permissions: [],
};
export async function authBridge(
  action: "exchange" | "sync" | "enroll",
  sourceToken?: string,
  details: Record<string, unknown> = {},
) {
  const data = await requestIgisBridge(
    action === "enroll"
      ? `${IGIS_URL}/functions/v1/igis-enroll`
      : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/igis-auth`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey:
          action === "enroll"
            ? IGIS_PUBLIC_KEY
            : import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        ...(sourceToken ? { Authorization: `Bearer ${sourceToken}` } : {}),
      },
      body: JSON.stringify({ action, ...details }),
      signal: AbortSignal.timeout(20000),
    },
  );
  return data as { session?: Session; ok?: boolean };
}
export async function connectIgis(session: Session) {
  if (!supabase) throw Error("로그인 서비스를 준비 중입니다.");
  const result = await authBridge("exchange", session.access_token);
  if (!result.session) throw Error("로그인 연결을 완료하지 못했습니다.");
  const { error } = await supabase.auth.setSession(result.session);
  if (error) throw error;
}
export async function signOutIgis() {
  // Clear both origin-local sessions; do not sign the employee out of their other IGIS apps.
  const results = await Promise.all([
    igis.auth.signOut({ scope: "local" }),
    supabase?.auth.signOut({ scope: "local" }),
  ]);
  const error = results.find((r) => r?.error)?.error;
  if (error) throw error;
}
export async function readAccess(): Promise<WorkplaceAccess> {
  if (!supabase) return noAccess;
  const { data, error } = await supabase.rpc("workplace_access");
  if (error) throw error;
  return data;
}
export function authMessage(error: unknown) {
  const e = error as { code?: string; message?: string; status?: number; name?: string };
  if (e?.name === "AuthRetryableFetchError" || error instanceof TypeError)
    return "IGIS 인증 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  if (e?.code === "invalid_credentials")
    return "이메일 또는 비밀번호가 올바르지 않습니다.";
  if (e?.code === "same_password")
    return "기존 비밀번호와 다른 비밀번호를 입력해 주세요.";
  if (e?.code === "weak_password") return "더 안전한 비밀번호를 입력해 주세요.";
  if (e?.status === 429 || e?.code === "over_email_send_rate_limit")
    return "요청이 많아 잠시 제한되었습니다. 잠시 후 다시 시도해 주세요.";
  if (e?.code === "otp_expired")
    return "재설정 링크가 만료되었습니다. 비밀번호 찾기를 다시 진행해 주세요.";
  return e?.message || "연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

let recoveryPromise: Promise<string> | null = null;
export function recoverIgis(): Promise<string> {
  if (recoveryPromise) return recoveryPromise;
  recoveryPromise = (async () => {
    const query = new URLSearchParams(location.search),
      hash = new URLSearchParams(location.hash.slice(1));
    const code = query.get("code");
    if (code) {
      const { data, error } = await igis.auth.exchangeCodeForSession(code);
      if (error || !data.session)
        throw Error("재설정 링크가 만료되었거나 유효하지 않습니다.");
      return data.session.user.email || "";
    }
    const access_token = hash.get("access_token"),
      refresh_token = hash.get("refresh_token");
    if (hash.get("type") !== "recovery" || !access_token || !refresh_token)
      throw Error("유효한 재설정 링크로 다시 접속해 주세요.");
    // Source server validates the bearer token before any recovery session is accepted.
    const checked = await igis.auth.getUser(access_token);
    if (checked.error || !checked.data.user)
      throw Error("재설정 링크가 만료되었거나 유효하지 않습니다.");
    const { data, error } = await igis.auth.setSession({
      access_token,
      refresh_token,
    });
    if (error || !data.session)
      throw Error("비밀번호 재설정을 시작하지 못했습니다.");
    return data.session.user.email || "";
  })().finally(() => {
    const u = new URL(location.href);
    u.hash = "";
    u.searchParams.delete("code");
    history.replaceState(null, "", u);
  });
  return recoveryPromise;
}
