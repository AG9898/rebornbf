import "server-only";
import { createSupabaseServerClient } from "../supabase/server.ts";
import { isOnboardingStep, type OnboardingState } from "./routing.ts";

/**
 * The caller's onboarding state, display name (null when signed out or unset), and wallet
 * balances for the status bar (null when signed out or unreadable).
 */
export type PlayerProfile = {
  state: OnboardingState;
  displayName: string | null;
  wallet: { gems: number; zel: number } | null;
};

const SIGNED_OUT: PlayerProfile = { state: { signedIn: false }, displayName: null, wallet: null };

/**
 * Reads the caller's profile under RLS: signed out when there is no session (or no Supabase
 * settings), otherwise their `profiles.onboarding_step` and `display_name`, and their `wallets` row.
 */
export async function getPlayerProfile(): Promise<PlayerProfile> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return SIGNED_OUT;
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return SIGNED_OUT;

  const [{ data }, { data: wallet, error: walletError }] = await Promise.all([
    supabase
      .from("profiles")
      .select("onboarding_step, display_name")
      .eq("id", userId)
      .maybeSingle(),
    supabase.from("wallets").select("gems, zel").eq("user_id", userId).maybeSingle(),
  ]);
  const step: unknown = data?.onboarding_step;
  const name: unknown = data?.display_name;
  return {
    state: { signedIn: true, step: isOnboardingStep(step) ? step : null },
    displayName: typeof name === "string" && name.length > 0 ? name : null,
    // No wallet row yet means nothing earned: both balances are 0.
    wallet: walletError ? null : { gems: Number(wallet?.gems ?? 0), zel: Number(wallet?.zel ?? 0) },
  };
}

/** The caller's onboarding state alone (the title screen's tap target). */
export async function getOnboardingState(): Promise<OnboardingState> {
  return (await getPlayerProfile()).state;
}
