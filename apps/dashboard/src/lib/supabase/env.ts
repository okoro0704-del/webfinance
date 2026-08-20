/** Normalize project URL — strip accidental /rest/v1 or /auth/v1 suffixes. */
export function getSupabaseUrl() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  }
  return raw.replace(/\/+$/, "").replace(/\/(rest|auth|storage|functions)\/v1$/i, "");
}

export function getSupabaseAnonKey() {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");
  }
  return key;
}
