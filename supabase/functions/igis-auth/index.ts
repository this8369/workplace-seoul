import { createClient } from "npm:@supabase/supabase-js@2.116.0";

// This endpoint validates IGIS tokens itself. Gateway JWT verification must be disabled
// because IGIS and Workplace are separate issuers. Never log request bodies/tokens.
const source = createClient(
  Deno.env.get("IGIS_URL")!,
  Deno.env.get("IGIS_ANON_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const target = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const allowed = new Set([
  "https://this8369.github.io",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
]);
const json = (body: unknown, status: number, origin: string) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": origin,
      Vary: "Origin",
      "Access-Control-Allow-Headers":
        "authorization,apikey,content-type,x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}
const emailOf = (v: unknown) =>
  typeof v === "string" ? v.trim().toLowerCase() : "";
async function member(email: string) {
  const { data, error } = await source
    .from("iota_seoul_pilot_members")
    .select("id,auth_id,email,staff_name,is_active")
    .eq("email", email)
    .maybeSingle();
  if (error)
    fail("직원 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.", 503);
  return data;
}
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  if (!allowed.has(origin))
    return json({ error: "허용되지 않은 요청입니다." }, 403, "null");
  if (req.method === "OPTIONS") return json({}, 200, origin);
  if (req.method !== "POST")
    return json({ error: "POST required" }, 405, origin);
  try {
    if (Number(req.headers.get("content-length") || 0) > 12000)
      fail("요청이 너무 큽니다.", 413);
    const text = await req.text();
    if (text.length > 12000) fail("요청이 너무 큽니다.", 413);
    const body = JSON.parse(text);
    // Fail closed until the source table's identity fields are protected from browser writes.
    const guard = await source.rpc("workplace_identity_guard_ready");
    if (guard.error || guard.data !== true)
      fail(
        "직원 계정 연결 설정을 마무리하고 있습니다. 잠시 후 다시 시도해 주세요.",
        503,
      );
    if (!["exchange", "sync"].includes(body.action)) fail("잘못된 요청입니다.");
    const token = req.headers.get("authorization")?.replace(/^Bearer /i, "");
    if (!token) fail("로그인이 필요합니다.", 401);
    // Verify with the source Auth server; decoded JWTs/client-supplied email are not trusted.
    const { data: identity, error: identityError } =
      await source.auth.getUser(token);
    const user = identity?.user;
    if (identityError || !user?.id || !user.email)
      fail("IGIS 로그인이 만료되었습니다. 다시 로그인해 주세요.", 401);
    const m = await member(emailOf(user.email));
    if (!m?.is_active || m.auth_id !== user.id) {
      await target.rpc("revoke_igis_identity", { source_user: user.id });
      fail(
        "활성 직원 계정을 확인할 수 없습니다. 관리자에게 문의해 주세요.",
        403,
      );
    }
    let localUser: { id: string; email?: string } | null = null;
    if (body.action === "sync") {
      if (typeof body.workplace_token !== "string")
        fail("Workplace 로그인이 필요합니다.", 401);
      const { data, error } = await target.auth.getUser(body.workplace_token);
      if (
        error ||
        !data.user ||
        emailOf(data.user.email) !== emailOf(user.email)
      )
        fail("계정이 일치하지 않습니다.", 403);
      localUser = data.user;
    } else {
      // Generate a one-time link server-side and consume its hash below. No email is sent.
      // Its confirmed email comes ONLY from the verified, linked IGIS identity above.
      const { data, error } = await target.auth.admin.generateLink({
        type: "magiclink",
        email: emailOf(user.email),
      });
      if (error || !data.user || !data.properties?.hashed_token)
        fail("서비스 로그인 연결에 실패했습니다.", 503);
      localUser = data.user;
      const { data: enabled, error: linkError } = await target.rpc(
        "link_igis_identity",
        {
          target_user: localUser.id,
          source_user: user.id,
          member_id: m.id,
          staff_name: m.staff_name,
          staff_email: user.email,
        },
      );
      if (linkError)
        fail(
          "계정 연결 정보가 일치하지 않습니다. 관리자에게 문의해 주세요.",
          403,
        );
      if (!enabled) fail("이 서비스의 이용 권한이 중지되어 있습니다.", 403);
      const verify = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      const result = await verify.auth.verifyOtp({
        type: "magiclink",
        token_hash: data.properties.hashed_token,
      });
      if (result.error || !result.data.session)
        fail("서비스 로그인을 완료하지 못했습니다.", 503);
      return json({ session: result.data.session }, 200, origin);
    }
    const { data: enabled, error } = await target.rpc("link_igis_identity", {
      target_user: localUser.id,
      source_user: user.id,
      member_id: m.id,
      staff_name: m.staff_name,
      staff_email: user.email,
    });
    if (error || !enabled) fail("서비스 이용 권한을 확인할 수 없습니다.", 403);
    return json({ ok: true }, 200, origin);
  } catch (error) {
    const e = error as Error & { status?: number };
    return json(
      {
        error: e.status
          ? e.message
          : "인증 서버 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      },
      e.status || 503,
      origin,
    );
  }
});
