import type { WorkplaceAccess } from "./igis-auth.ts";

export type AccessSnapshot = {
  status: "checking" | "ready" | "unavailable" | "denied";
  access: WorkplaceAccess;
};
const emptyAccess: WorkplaceAccess = { display_name: null, permissions: [] };

/** A refresh never revokes an unexpired attestation, or extends an expired one. */
export function createAccessMonitor(options: {
  verify: () => Promise<WorkplaceAccess>;
  publish: (snapshot: AccessSnapshot) => void;
  onDenied: (error: Error) => void;
  visible: () => boolean;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  let alive = true;
  let snapshot: AccessSnapshot = { status: "checking", access: emptyAccess };
  let running: Promise<void> | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const valid = () => Date.parse(snapshot.access.verified_until || "") > now();
  function publish(status: AccessSnapshot["status"], access = snapshot.access) {
    snapshot = { status, access };
    options.publish(snapshot);
  }
  function expire() {
    if (!alive) return;
    publish("checking", emptyAccess);
    if (options.visible()) void refresh();
  }
  async function verify() {
    try {
      const access = await options.verify();
      if (!alive) return;
      clearTimeout(expiry);
      const remaining = Date.parse(access.verified_until || "") - now();
      if (!(remaining > 0)) {
        publish("denied", emptyAccess);
        return;
      }
      publish("ready", access);
      expiry = setTimeout(expire, remaining);
    } catch (error) {
      if (!alive) return;
      const status = (error as { status?: number }).status;
      if (status === 401 || status === 403) {
        clearTimeout(expiry);
        publish("denied", emptyAccess);
        options.onDenied(error as Error);
      } else {
        // Offline, timeouts and server errors do not mean the user signed out.
        publish("unavailable", valid() ? snapshot.access : emptyAccess);
        retry = setTimeout(() => {
          if (options.visible()) void refresh();
        }, 5000);
      }
    }
  }
  function refresh(): Promise<void> {
    if (!alive) return Promise.resolve();
    if (running) return running;
    clearTimeout(retry);
    if (!valid()) publish("checking", emptyAccess);
    running = verify().finally(() => {
      running = undefined;
    });
    return running;
  }
  return {
    refresh,
    dispose() {
      alive = false;
      clearTimeout(expiry);
      clearTimeout(retry);
    },
  };
}
