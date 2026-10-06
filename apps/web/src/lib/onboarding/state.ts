import "server-only";
import { audioLevels, parsePlayerSettings } from "../settings/player-settings.ts";
import { createSupabaseServerClient } from "../supabase/server.ts";
import { isOnboardingStep, type OnboardingState } from "./routing.ts";

/**
 * The caller's onboarding state, display name (null when signed out or unset), and wallet
 * balances for the status bar (null when signed out or unreadable), and their saved music and SFX
 * levels (0–1) for the menu's audio (null when signed out or unreadable: the audio defaults play).
 */
export type PlayerProfile = {
  state: OnboardingState;
  displayName: string | null;
  wallet: { gems: number; zel: number } | null;
  volume: { music: number; sfx: number } | null;
};

const SIGNED_OUT: PlayerProfile = {
  state: { signedIn: false },
  displayName: null,
  wallet: null,
  volume: null,
};

/**
 * Reads the caller's profile under RLS: signed out when there is no session (or no Supabase
 * settings), otherwise their `profiles.onboarding_step` and `display_name`, their `wallets` row,
 * and the volumes from their `player_settings` row (no row = the documented defaults, M7-01_4).
 */
export async function getPlayerProfile(): Promise<PlayerProfile> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return SIGNED_OUT;
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return SIGNED_OUT;

  const [{ data }, { data: wallet, error: walletError }, { data: settings, error: settingsError }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("onboarding_step, display_name")
        .eq("id", userId)
        .maybeSingle(),
      supabase.from("wallets").select("gems, zel").eq("user_id", userId).maybeSingle(),
      supabase
        .from("player_settings")
        .select("music_volume, sfx_volume")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
  const step: unknown = data?.onboarding_step;
  const name: unknown = data?.display_name;
  return {
    state: { signedIn: true, step: isOnboardingStep(step) ? step : null },
    displayName: typeof name === "string" && name.length > 0 ? name : null,
    // No wallet row yet means nothing earned: both balances are 0.
    wallet: walletError ? null : { gems: Number(wallet?.gems ?? 0), zel: Number(wallet?.zel ?? 0) },
    volume: settingsError ? null : audioLevels(parsePlayerSettings(settings)),
  };
}

/** The caller's onboarding state alone (the title screen's tap target). */
export async function getOnboardingState(): Promise<OnboardingState> {
  return (await getPlayerProfile()).state;
}
