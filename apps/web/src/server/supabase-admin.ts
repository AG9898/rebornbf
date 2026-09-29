import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv } from "../lib/supabase/env.ts";

/**
 * A Supabase client with the secret key (service role: bypasses RLS). Only battle verification
 * uses it (RESOLVED-08); never import it from client code. Returns null when the Supabase URL or
 * `SUPABASE_SECRET_KEY` is unset. No session is persisted: every request acts as the service role.
 */
export function createSupabaseAdminClient(): SupabaseClient | null {
  const env = getSupabasePublicEnv();
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!env || !secretKey) return null;
  return createClient(env.url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
