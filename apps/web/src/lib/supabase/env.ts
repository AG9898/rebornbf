export type SupabasePublicEnv = { url: string; publishableKey: string };

/**
 * The browser-safe Supabase settings, or null when the deployment has none (M0–M2 builds and any
 * Vercel environment that has not been given Supabase variables yet). Callers treat null as
 * "sign-in unavailable" rather than crashing, so public pages keep working.
 *
 * `process.env.NEXT_PUBLIC_*` must be read by its literal name so Next.js can inline it.
 */
export function getSupabasePublicEnv(): SupabasePublicEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}
