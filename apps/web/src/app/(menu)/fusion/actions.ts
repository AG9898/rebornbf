"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../lib/supabase/server.ts";
import { fusionDraftProblem, fusionResultMessage } from "../../../lib/units/fusion.ts";
import { type FuseResponse, parseFuseResponse } from "../../../lib/units/fusion-result.ts";
import { type StackQuantities, stackArgs } from "../../../lib/units/unit-stacks.ts";

/** `response` carries `fuse`'s outcome for the result screen; null if it came back malformed. */
export type FuseResult =
  | { ok: true; message: string; response: FuseResponse | null }
  | { ok: false; message: string };

/**
 * Fuses owned-row fodder and stacked copies (`{ "<stack id>": copies }`, M4-05C) into `target`
 * through the `fuse` RPC, which re-checks ownership, squads, limits, and Zel.
 */
export async function fuseUnits(
  target: string,
  fodder: string[],
  stacks: StackQuantities = {},
): Promise<FuseResult> {
  const problem = fusionDraftProblem(target, fodder, stacks);
  if (problem) return { ok: false, message: problem };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Fusion is unavailable right now." };
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) return { ok: false, message: "Sign in to fuse units." };
  const { data, error } = await supabase.rpc("fuse", {
    p_target: target,
    p_fodder: fodder,
    p_fodder_stacks: stackArgs(stacks),
  });
  if (error) {
    return {
      ok: false,
      message:
        error.code === "22023" || error.code === "P0001"
          ? error.message.replace(/^fuse: /, "")
          : "Fusion failed. Reload your collection and try again.",
    };
  }
  for (const path of ["/fusion", "/units/list", `/units/${target}`, "/home", "/squad"])
    revalidatePath(path);
  return { ok: true, message: fusionResultMessage(data), response: parseFuseResponse(data) };
}
