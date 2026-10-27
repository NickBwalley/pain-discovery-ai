import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Kept separate from the cookie client; this key never enters browser code. */
export async function emailForUsername(username: string): Promise<string | null> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !url) return null;
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.rpc("resolve_login_email", { p_username: username });
  return !error && typeof data === "string" ? data : null;
}
