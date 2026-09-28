import { createClient } from "@supabase/supabase-js";

// Public browsing must not wait for an expired employee session to refresh.
// Authenticated writes and private staff data continue to use the auth client.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const publicSupabase =
  url && key
    ? createClient(url, key, {
        auth: {
          storageKey: "workplace-public-browse",
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      })
    : null;
