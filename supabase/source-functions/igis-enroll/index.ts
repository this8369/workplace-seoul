import { createClient } from "npm:@supabase/supabase-js@2.116.0";

// Deploy ONLY to the IGIS project. The source service key stays in its own project.
// Public enrollment verifies the server-held invitation code and pre-registered employee.
const source = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_ANON_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const sourceAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const allowed = new Set([
  "https://this8369.github.io",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "https://iotaseoul.cloud",
  "https://songhyeon.iotaseoul.site",
  "http://localhost:8081",
  "http://localhost:8082",
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
    if (body.action === "enroll") {
      // Rate limit attempts before checking the shared code, including wrong-code attempts.
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(emailOf(body.email)),
      );
      const attemptKey = Array.from(new Uint8Array(digest), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
      const limit = await sourceAdmin.rpc("consume_igis_auth_attempt", {
        attempt_key: attemptKey,
      });
      if (limit.error) fail("최초 접속 확인을 준비 중입니다.", 503);
      if (!limit.data)
        fail(
          "요청이 많아 잠시 제한되었습니다. 15분 후 다시 시도해 주세요.",
          429,
        );
      if (!sourceAdmin) fail("최초 계정 설정을 준비 중입니다.", 503);
      const code = Deno.env.get("IGIS_FIRST_ACCESS_CODE");
      if (!code)
        fail(
          "최초 비밀번호 설정을 준비 중입니다. 기존 IGIS 플랫폼에서 먼저 설정해 주세요.",
          503,
        );
      if (
        typeof body.access_code !== "string" ||
        body.access_code.trim().toUpperCase() !== code.toUpperCase()
      )
        fail("최초 접속 코드가 올바르지 않습니다.", 403);
      const email = emailOf(body.email),
        m = await member(email);
      if (!m?.is_active) fail("등록된 활성 직원만 이용할 수 있습니다.", 403);
      if (m.auth_id)
        fail("이미 등록된 계정입니다. 기존 비밀번호로 로그인해 주세요.", 409);
      if (
        typeof body.password !== "string" ||
        body.password.length < 6 ||
        body.password.length > 128
      )
        fail("비밀번호는 6~128자리로 입력해 주세요.");
      // Use an isolated client: never allow one request's source session to leak to another.
      const signup = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      let { data, error } = await signup.auth.signUp({
        email,
        password: body.password,
      });
      if (
        (!data.session && !error) ||
        error?.code === "user_already_exists" ||
        error?.code === "email_exists"
      ) {
        // Heal an existing Auth account whose employee linkage was reset, but only with its real password.
        const existing = await signup.auth.signInWithPassword({
          email,
          password: body.password,
        });
        data = existing.data;
        error = existing.error;
      }
      if (error || !data.session || !data.user)
        fail(
          "계정을 설정하지 못했습니다. 이미 가입했다면 기존 비밀번호 또는 비밀번호 찾기를 이용해 주세요.",
          409,
        );
      // Conditional bind preserves an existing employee identity even if two requests race.
      const { data: updated, error: bindError } = await sourceAdmin
        .from("iota_seoul_pilot_members")
        .update({
          auth_id: data.user.id,
          last_login_at: new Date().toISOString(),
        })
        .eq("id", m.id)
        .is("auth_id", null)
        .eq("is_active", true)
        .select("id");
      if (bindError || updated?.length !== 1)
        fail(
          "직원 계정 연결을 완료하지 못했습니다. 관리자에게 문의해 주세요.",
          409,
        );
      return json({ session: data.session }, 200, origin);
    }
    fail("잘못된 요청입니다.");
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
