import test from "node:test";
import assert from "node:assert/strict";
import { loginErrorMessage } from "./auth-feedback.ts";

test("mail quota, unauthorized recipient and connection failure provide distinct actions", () => {
  assert.match(loginErrorMessage({ code: "over_email_send_rate_limit", status: 429 }), /발송 한도/);
  assert.match(loginErrorMessage({ code: "email_address_not_authorized", status: 403 }), /메일 발송 설정/);
  assert.match(loginErrorMessage({ status: 429 }), /일시적으로 제한/);
  assert.match(loginErrorMessage(new TypeError("Failed to fetch")), /인터넷 연결/);
});

test("unknown server errors do not expose raw server responses or claim delivery", () => {
  const message = loginErrorMessage({ message: "private server details", status: 500 });
  assert.match(message, /보내지 못했습니다/);
  assert.doesNotMatch(message, /private server details|보냈습니다/);
  assert.equal(loginErrorMessage(null), message);
});
