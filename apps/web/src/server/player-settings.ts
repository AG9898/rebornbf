import "server-only";
import {
  DEFAULT_PLAYER_SETTINGS,
  type PlayerSettings,
  type PlayerSettingsRow,
  parsePlayerSettings,
} from "../lib/settings/player-settings.ts";
import { createSupabaseServerClient } from "../lib/supabase/server.ts";

/**
 * Loads the caller's settings through `get_settings` (M7-01_1), which reads the caller's own row
 * under RLS and returns the documented defaults when none is saved. Signed-out callers and failed
 * reads also get the defaults; `failed` lets a settings screen avoid overwriting unread values.
 */
export async function loadPlayerSettings(): Promise<{
  settings: PlayerSettings;
  signedIn: boolean;
  failed: boolean;
}> {
  const supabase = await createSupabaseServerClient();
  const { data: claims } = supabase ? await supabase.auth.getClaims() : { data: null };
  if (!supabase || !claims?.claims.sub) {
    return { settings: DEFAULT_PLAYER_SETTINGS, signedIn: false, failed: false };
  }
  // get_settings returns one composite row (not a set), which PostgREST sends as an object.
  const { data, error } = await supabase.rpc("get_settings");
  if (error) return { settings: DEFAULT_PLAYER_SETTINGS, signedIn: true, failed: true };
  return {
    settings: parsePlayerSettings(data as PlayerSettingsRow | null),
    signedIn: true,
    failed: false,
  };
}
