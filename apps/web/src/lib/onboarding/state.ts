import "server-only";
import { createSupabaseServerClient } from "../supabase/server.ts";
import { isOnboardingStep, type OnboardingState } from "./routing.ts";

/** The caller's onboarding state and display name (null when signed out or unset). */
export type PlayerProfile = { state: OnboardingState; displayName: string | null };

/**
 * Reads the caller's profile under RLS: signed out when there is no session (or no Supabase
 * settings), otherwise their `profiles.onboarding_step` and `display_name`.
 */
export async function getPlayerProfile(): Promise<PlayerProfile> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { state: { signedIn: false }, displayName: null };
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return { state: { signedIn: false }, displayName: null };

  const { data } = await supabase
    .from("profiles")
    .select("onboarding_step, display_name")
    .eq("id", userId)
    .maybeSingle();
  const step: unknown = data?.onboarding_step;
  const name: unknown = data?.display_name;
  return {
    state: { signedIn: true, step: isOnboardingStep(step) ? step : null },
    displayName: typeof name === "string" && name.length > 0 ? name : null,
  };
}

/** The caller's onboarding state alone (the title screen's tap target). */
export async function getOnboardingState(): Promise<OnboardingState> {
  return (await getPlayerProfile()).state;
}
