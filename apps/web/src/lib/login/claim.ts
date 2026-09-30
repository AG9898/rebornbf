import "server-only";
import { createSupabaseServerClient } from "../supabase/server.ts";
import { type LoginClaim, parseLoginClaim } from "./login-reward.ts";

/**
 * Claims today's login calendar step for the signed-in player (`claim_login_reward()`, M5-03A).
 * Idempotent per UTC day on the server. Signed out, no Supabase settings, or any error is null,
 * so the home screen quietly shows no popup.
 */
export async function claimLoginReward(): Promise<LoginClaim | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;
    const { data: claims } = await supabase.auth.getClaims();
    if (!claims?.claims.sub) return null;
    const { data, error } = await supabase.rpc("claim_login_reward");
    if (error) return null;
    return parseLoginClaim(data);
  } catch {
    return null;
  }
}
