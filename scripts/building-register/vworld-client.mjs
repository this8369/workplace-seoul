import pg from "pg";
import { readFile, writeFile, mkdir } from "node:fs/promises";
export async function connectDatabase() {
  const { reviewerEmail, ...config } = JSON.parse(
    await readFile("data/private/db-config.json", "utf8"),
  );
  const db = new pg.Client({
    ...config,
    password: (await readFile("data/private/db-password", "utf8")).trim(),
    ssl: {
      rejectUnauthorized: true,
      ca: await readFile("data/private/supabase-ca.crt", "utf8"),
    },
    connectionTimeoutMillis: 15000,
  });
  await db.connect();
  return db;
}
export async function vworldClient() {
  const key = (await readFile("data/private/vworld-key", "utf8")).trim(),
    domain = (await readFile("data/private/vworld-domain", "utf8")).trim();
  await mkdir("data/private/vworld", { recursive: true, mode: 0o700 });
  return async function request(path, params, cacheName) {
    const file = `data/private/vworld/${cacheName}.json`;
    try {
      const c = JSON.parse(await readFile(file, "utf8"));
      if (Date.now() - Date.parse(c.collected_at) < 86400000) return c.body;
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    const url = new URL(path, "https://api.vworld.kr");
    url.search = new URLSearchParams({ ...params, key, domain });
    let r;
    try {
      r = await fetch(url, {
        signal: AbortSignal.timeout(30000),
        redirect: "error",
      });
    } catch {
      throw new Error("VWorld connection failed (credentials omitted)");
    }
    if (!r.ok) throw new Error(`VWorld HTTP ${r.status}`);
    let body;
    try {
      body = JSON.parse(
        (await r.text()).replace(
          /("pnu"\s*:\s*)(\d{19})(?=\s*[,}])/g,
          '$1"$2"',
        ),
      );
    } catch {
      throw new Error("Invalid VWorld response");
    }
    const error = body.response?.error ?? body.error;
    if (error)
      throw new Error(
        `VWorld ${String(error.code ?? "API_ERROR").replace(/[^A-Z0-9_]/gi, "")}`,
      );
    await writeFile(
      file,
      JSON.stringify({ collected_at: new Date().toISOString(), body }),
      { mode: 0o600 },
    );
    await new Promise((r) => setTimeout(r, 150));
    return body;
  };
}
