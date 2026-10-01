"use server";

import { revalidatePath } from "next/cache";
import {
  isSummonCount,
  parseSummonResult,
  type SummonOutcome,
  summonBanner,
} from "../../../lib/summon/summon.ts";
import { createSupabaseServerClient } from "../../../lib/supabase/server.ts";

export type SummonActionResult =
  | { ok: true; outcome: SummonOutcome }
  | { ok: false; message: string };

/**
 * Pulls `count` (1 or 11) on `bannerId` through the `summon` RPC, which debits gems, rolls with
 * server RNG, and grants every unit in one transaction (M5-01A). The client only plays the result.
 */
export async function summonUnits(bannerId: string, count: number): Promise<SummonActionResult> {
  if (!summonBanner(bannerId) || !isSummonCount(count)) {
    return { ok: false, message: "That summon is not available." };
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Summoning is unavailable right now." };
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) return { ok: false, message: "Sign in to summon." };
  const { data, error } = await supabase.rpc("summon", { p_banner_id: bannerId, p_count: count });
  if (error) {
    return {
      ok: false,
      message:
        error.message === "summon: insufficient gems"
          ? "Not enough gems."
          : "The summon failed. No gems were spent; try again shortly.",
    };
  }
  const outcome = parseSummonResult(data);
  if (!outcome)
    return {
      ok: false,
      message: "The summon finished, but its results could not be read. Check your units.",
    };
  for (const path of ["/summon", "/units", "/home"]) revalidatePath(path);
  return { ok: true, outcome };
}
