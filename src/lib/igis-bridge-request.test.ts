import test from "node:test";
import assert from "node:assert/strict";
import { requestIgisBridge } from "./igis-bridge-request.ts";

test("missing function and CORS/network failure are not reported as wrong passwords", async () => {
  await assert.rejects(
    requestIgisBridge("https://example.invalid", {}, async () => { throw new TypeError("Failed to fetch"); }),
    { code: "igis_bridge_unreachable", message: /비밀번호 오류가 아닙니다/ },
  );
  await assert.rejects(
    requestIgisBridge("https://example.invalid", {}, async () => Response.json({ code: "NOT_FOUND", message: "Requested function was not found" }, { status: 404 })),
    { code: "igis_bridge_not_deployed", status: 404, message: /운영 설정이 완료되지/ },
  );
});

test("bridge authorization denial is preserved and cannot become a successful session", async () => {
  await assert.rejects(
    requestIgisBridge("https://example.invalid", {}, async () => Response.json({ error: "서비스 이용 권한이 중지되어 있습니다." }, { status: 403 })),
    { status: 403, message: /이용 권한이 중지/ },
  );
  assert.deepEqual(
    await requestIgisBridge("https://example.invalid", {}, async () => Response.json({ ok: true })),
    { ok: true },
  );
});
