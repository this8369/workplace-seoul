import { defineConfig, loadEnv } from "vite";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    base: process.env.BASE_PATH || "/",
    build: { sourcemap: false },
    server: {
      fs: {
        deny: [
          ".env",
          ".env.*",
          "**/.git/**",
          "**/data/private/**",
          "**/*.{crt,pem,key}",
        ],
      },
    },
    plugins: [
      {
        name: "local-photo-import",
        apply: "serve",
        configureServer(server) {
          // Local preparation only; never included in a production build. Reads one fixed
          // manifest, and uses the logged-in reviewer's permissions, not an admin key.
          server.middlewares.use("/__local-photo-batch", async (req, res) => {
            res.setHeader("Cache-Control", "no-store");
            const token = req.headers.authorization?.replace(/^Bearer /, "");
            if (
              req.method !== "GET" ||
              !token ||
              !env.VITE_SUPABASE_URL ||
              !env.VITE_SUPABASE_PUBLISHABLE_KEY
            ) {
              res.statusCode = 403;
              res.end();
              return;
            }
            try {
              const client = createClient(
                env.VITE_SUPABASE_URL,
                env.VITE_SUPABASE_PUBLISHABLE_KEY,
                {
                  global: { headers: { Authorization: `Bearer ${token}` } },
                  auth: { persistSession: false, autoRefreshToken: false },
                },
              );
              const access = await client.rpc("can_review_records");
              if (access.error || access.data !== true) {
                res.statusCode = 403;
                res.end();
                return;
              }
              const contents = await readFile(
                "data/private/images/workplace-photos.json",
              );
              res.setHeader("Content-Type", "application/json");
              res.end(contents);
            } catch {
              res.statusCode = 503;
              res.end("Photo batch unavailable");
            }
          });
        },
      },
    ],
  };
});
