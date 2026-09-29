"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv } from "./env.ts";

/** The browser Supabase client (session in cookies shared with the server), or null if unset. */
export function createSupabaseBrowserClient(): SupabaseClient | null {
  const env = getSupabasePublicEnv();
  if (!env) return null;
  return createBrowserClient(env.url, env.publishableKey);
}
