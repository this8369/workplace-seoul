import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import {
  createAccessMonitor,
  type AccessSnapshot,
} from "./workplace-access-monitor.ts";
import type { WorkplaceAccess } from "./igis-auth.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup(t: TestContext) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1000000 });
  let visible = true;
  let verify: () => Promise<WorkplaceAccess> = async () => access();
  const snapshots: AccessSnapshot[] = [];
  const denied: Error[] = [];
  const monitor = createAccessMonitor({
    verify: () => verify(),
    publish: (snapshot) => snapshots.push(snapshot),
    onDenied: (error) => denied.push(error),
    visible: () => visible,
  });
  t.after(() => monitor.dispose());
  function access(): WorkplaceAccess {
    return {
      display_name: "테스트 사용자",
      linked: true,
      verified_until: new Date(Date.now() + 120000).toISOString(),
      permissions: ["details.read"],
    };
  }
  return {
    monitor,
    snapshots,
    denied,
    access,
    latest: () => snapshots.at(-1)!,
    verify: (fn: typeof verify) => {
      verify = fn;
    },
    visible: (value: boolean) => {
      visible = value;
    },
  };
}

test("focus and token refresh retain valid permissions and share the in-flight check", async (t) => {
  const s = setup(t);
  await s.monitor.refresh();
  const pending = deferred<WorkplaceAccess>();
  let calls = 0;
  s.verify(() => {
    calls++;
    return pending.promise;
  });
  const first = s.monitor.refresh();
  const second = s.monitor.refresh();
  assert.equal(first, second);
  assert.equal(calls, 1);
  assert.equal(s.latest().status, "ready");
  assert.deepEqual(s.latest().access.permissions, ["details.read"]);
  pending.resolve(s.access());
  await first;
  assert.equal(s.latest().status, "ready");
});

test("returning after background expiry waits for revalidation, without extending private access", async (t) => {
  const s = setup(t);
  await s.monitor.refresh();
  s.visible(false);
  t.mock.timers.tick(120001);
  assert.equal(s.latest().status, "checking");
  assert.deepEqual(s.latest().access.permissions, []);
  s.visible(true);
  const pending = deferred<WorkplaceAccess>();
  s.verify(() => pending.promise);
  const resumed = s.monitor.refresh();
  assert.equal(s.latest().status, "checking");
  assert.equal(s.denied.length, 0);
  pending.resolve(s.access());
  await resumed;
  assert.equal(s.latest().status, "ready");
  assert.deepEqual(s.latest().access.permissions, ["details.read"]);
});

test("temporary network failures do not sign out; permissions still expire and recover on retry", async (t) => {
  const s = setup(t);
  await s.monitor.refresh();
  s.verify(async () => {
    throw new TypeError("Offline");
  });
  await s.monitor.refresh();
  assert.equal(s.latest().status, "unavailable");
  assert.deepEqual(s.latest().access.permissions, ["details.read"]);
  s.visible(false);
  t.mock.timers.tick(120001);
  await s.monitor.refresh();
  assert.equal(s.latest().status, "unavailable");
  assert.deepEqual(s.latest().access.permissions, []);
  assert.equal(s.denied.length, 0);
  s.visible(true);
  s.verify(async () => s.access());
  t.mock.timers.tick(5000);
  await s.monitor.refresh();
  assert.equal(s.latest().status, "ready");
});

test("explicit server revocation removes even unexpired permissions immediately", async (t) => {
  const s = setup(t);
  await s.monitor.refresh();
  s.verify(async () => {
    throw Object.assign(Error("Revoked"), { status: 403 });
  });
  await s.monitor.refresh();
  assert.equal(s.latest().status, "denied");
  assert.deepEqual(s.latest().access.permissions, []);
  assert.equal(s.denied.length, 1);
});

test("late success or rejection from an old account cannot restore access or sign out a new account", async (t) => {
  const s = setup(t);
  const pending = deferred<WorkplaceAccess>();
  s.verify(() => pending.promise);
  const check = s.monitor.refresh();
  s.monitor.dispose();
  const count = s.snapshots.length;
  pending.reject(Object.assign(Error("Old token"), { status: 401 }));
  await check;
  assert.equal(s.snapshots.length, count);
  assert.equal(s.denied.length, 0);
  await s.monitor.refresh();
  assert.equal(s.snapshots.length, count);
});

test("an expired server attestation cannot unlock private details", async (t) => {
  const s = setup(t);
  s.verify(async () => ({
    ...s.access(),
    verified_until: new Date(Date.now() - 1).toISOString(),
  }));
  await s.monitor.refresh();
  assert.equal(s.latest().status, "denied");
  assert.deepEqual(s.latest().access.permissions, []);
});
