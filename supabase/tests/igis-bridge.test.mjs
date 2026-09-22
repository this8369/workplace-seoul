import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
const sourceCode = (
  await readFile(
    new URL("../functions/igis-auth/index.ts", import.meta.url),
    "utf8",
  )
).replace(/^import .*\n/, "");
const enrollmentSource = (
  await readFile(
    new URL("../source-functions/igis-enroll/index.ts", import.meta.url),
    "utf8",
  )
).replace(/^import .*\n/, "");
const compile = (sourceCode) =>
  ts.transpileModule(sourceCode, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
    },
  }).outputText;
function fixture(options = {}) {
  let handler;
  const calls = [];
  const employee = {
    id: "member-1",
    auth_id: "source-1",
    email: "staff@igis.test",
    staff_name: "Staff",
    is_active: true,
    ...options.member,
  };
  const source = {
    rpc: async () => ({ data: options.unsafeSource ? false : true }),
    auth: {
      signUp: async () => {
        calls.push(["signup"]);
        return {
          data: {
            user: { id: "new-source" },
            session: { access_token: "new-source-token" },
          },
          error: null,
        };
      },
      getUser: async (token) => {
        calls.push(["source-verify", token]);
        return token === "valid-source"
          ? { data: { user: { id: "source-1", email: "staff@igis.test" } } }
          : { data: { user: null }, error: { message: "invalid" } };
      },
    },
    from: () => ({
      update: (values) => {
        calls.push(["bind-member", values]);
        const chain = {
          eq: () => chain,
          is: () => chain,
          select: async () => ({
            data: options.bindConflict ? [] : [{ id: employee.id }],
          }),
        };
        return chain;
      },
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: employee }) }),
      }),
    }),
  };
  const target = {
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: "local-1",
            email: options.localEmail || "staff@igis.test",
          },
        },
      }),
      admin: {
        generateLink: async () => {
          calls.push(["generate-link"]);
          return {
            data: {
              user: { id: "local-1" },
              properties: { hashed_token: "one-time-hash" },
            },
          };
        },
      },
    },
    rpc: async (name, args) => {
      calls.push([name, args]);
      return {
        data: options.disabled && name === "link_igis_identity" ? false : true,
        error:
          options.linkError && name === "link_igis_identity"
            ? { message: "mismatch" }
            : null,
      };
    },
  };
  const verifier = {
    auth: {
      verifyOtp: async (args) => {
        calls.push(["verify-otp", args]);
        return {
          data: {
            session: { access_token: "target-token", refresh_token: "refresh" },
          },
        };
      },
    },
  };
  const env = {
    IGIS_URL: "source",
    IGIS_ANON_KEY: "public",
    SUPABASE_URL: options.enroll ? "source" : "target",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    SUPABASE_ANON_KEY: "anon",
    IGIS_FIRST_ACCESS_CODE: "secret",
    IGIS_SERVICE_ROLE_KEY: "source-service",
  };
  const context = {
    Request,
    Response,
    Set,
    Error,
    JSON,
    TextEncoder,
    Uint8Array,
    crypto,
    createClient: (url, key) =>
      url === "source"
        ? options.enroll && key === "service"
          ? { ...source, rpc: target.rpc }
          : source
        : key === "service"
          ? target
          : verifier,
    Deno: { env: { get: (k) => env[k] }, serve: (f) => (handler = f) },
  };
  vm.runInNewContext(
    compile(options.enroll ? enrollmentSource : sourceCode),
    context,
  );
  async function request(
    body,
    token = "valid-source",
    origin = "https://this8369.github.io",
  ) {
    const r = await handler(
      new Request("https://target/functions/v1/igis-auth", {
        method: "POST",
        headers: { origin, authorization: "Bearer " + token },
        body: JSON.stringify(body),
      }),
    );
    return { status: r.status, data: await r.json() };
  }
  return { calls, request };
}
test("bridge verifies source token and consumes its one-time target hash without emailing or exposing it", async () => {
  const f = fixture();
  const r = await f.request({
    action: "exchange",
    email: "attacker@elsewhere.test",
    role: "admin",
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.session.access_token, "target-token");
  assert.ok(!JSON.stringify(r.data).includes("one-time-hash"));
  assert.equal(f.calls[0][0], "source-verify");
  const link = f.calls.find((x) => x[0] === "link_igis_identity")[1];
  assert.equal(link.staff_email, "staff@igis.test");
  assert.equal(link.source_user, "source-1");
  assert.equal(link.role, undefined);
  assert.equal(
    f.calls.find((x) => x[0] === "verify-otp")[1].token_hash,
    "one-time-hash",
  );
});
test("bridge rejects invalid issuer tokens, inactive or mismatched membership before creating local sessions", async () => {
  for (const options of [
    { token: "forged" },
    { member: { is_active: false } },
    { member: { auth_id: "someone-else" } },
  ]) {
    const f = fixture(options),
      r = await f.request({ action: "exchange" }, options.token);
    assert.ok([401, 403].includes(r.status));
    assert.ok(!f.calls.some((c) => c[0] === "generate-link"));
  }
});
test("sync cannot refresh another account, disabled local users and identity conflicts receive no session", async () => {
  const mismatch = fixture({ localEmail: "other@test.invalid" });
  assert.equal(
    (
      await mismatch.request({
        action: "sync",
        workplace_token: "target-token",
      })
    ).status,
    403,
  );
  assert.ok(!mismatch.calls.some((c) => c[0] === "link_igis_identity"));
  for (const options of [{ disabled: true }, { linkError: true }]) {
    const f = fixture(options);
    assert.equal((await f.request({ action: "exchange" })).status, 403);
    assert.ok(!f.calls.some((c) => c[0] === "verify-otp"));
  }
});
test("wrong origins and wrong initial access codes are rejected, with server-side attempt accounting", async () => {
  const f = fixture({ enroll: true });
  assert.equal(
    (
      await f.request(
        { action: "exchange" },
        "valid-source",
        "https://attacker.test",
      )
    ).status,
    403,
  );
  assert.equal(f.calls.length, 0);
  assert.equal(
    (
      await f.request({
        action: "enroll",
        email: "staff@igis.test",
        access_code: "wrong",
      })
    ).status,
    403,
  );
  assert.equal(f.calls[0][0], "consume_igis_auth_attempt");
});

test("an unprotected source identity table cannot be enabled accidentally", async () => {
  const f = fixture({ unsafeSource: true });
  assert.equal((await f.request({ action: "exchange" })).status, 503);
  assert.equal(f.calls.length, 0);
});
test("first enrollment binds only an unclaimed active employee after the server code check", async () => {
  const f = fixture({ enroll: true, member: { auth_id: null } });
  const r = await f.request({
    action: "enroll",
    email: "staff@igis.test",
    password: "test-password-only",
    access_code: "secret",
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.session.access_token, "new-source-token");
  assert.equal(
    f.calls.find((c) => c[0] === "bind-member")[1].auth_id,
    "new-source",
  );
  assert.ok(!f.calls.some((c) => c[0] === "generate-link"));
  for (const options of [
    { member: { auth_id: "existing" } },
    { member: { auth_id: null, is_active: false } },
    { member: { auth_id: null }, bindConflict: true },
  ]) {
    const denied = fixture({ ...options, enroll: true });
    assert.ok(
      [403, 409].includes(
        (
          await denied.request({
            action: "enroll",
            email: "staff@igis.test",
            password: "test-password-only",
            access_code: "secret",
          })
        ).status,
      ),
    );
  }
});
