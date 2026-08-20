import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

let browserClient: SupabaseClient | null = null;

/** Reuse one browser client — recreating per click slows logout/auth. */
export function createClient() {
  if (browserClient) return browserClient;
  browserClient = createBrowserClient(getSupabaseUrl(), getSupabaseAnonKey());
  return browserClient;
}
