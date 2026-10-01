import "server-only";
import {
  FINISH_SESSION_COLUMNS,
  type FinishSessionRow,
  verifyFinish,
} from "../lib/battle/finish.ts";
import { MAX_FINISH_BODY_BYTES } from "../lib/battle/replay.ts";
import { isBattleSessionId } from "../lib/battle/session-battle.ts";
import { createSupabaseServerClient } from "../lib/supabase/server.ts";
import { createSupabaseAdminClient } from "./supabase-admin.ts";

/**
 * `POST /api/battles/finish` (M3-04C, RESOLVED-08). Body: `{ session_id, input_log }`.
 *
 * 1. Rejects bodies over `MAX_FINISH_BODY_BYTES` (413) and malformed JSON (400).
 * 2. Authenticates the caller from the Supabase session cookies (`getClaims`; 401 when signed out).
 * 3. Loads the session with the secret key, so a foreign session is found and refused (403)
 *    rather than hidden by RLS; finished (409), expired (410), or other-content sessions and bad
 *    logs are refused by `verifyFinish`, which replays the log with the engine (422 unless ended).
 * 4. A verified win grants rewards; a loss settles without rewards. Both service-only RPCs
 *    claim and refund replay-derived unused items atomically; concurrent submissions get 409.
 *    A continue request instead proves the loss without settling or refunding.
 */

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function fail(status: number, error: string): Response {
  return json(status, { ok: false, error });
}

async function readBody(request: Request): Promise<{ value: unknown } | Response> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_FINISH_BODY_BYTES) return fail(413, "The input log is too large.");
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_FINISH_BODY_BYTES) {
    return fail(413, "The input log is too large.");
  }
  try {
    return { value: JSON.parse(text) as unknown };
  } catch {
    return fail(400, "The request body is not JSON.");
  }
}

export async function finishBattle(request: Request, continuing = false): Promise<Response> {
  const body = await readBody(request);
  if (body instanceof Response) return body;
  const { value } = body;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(400, "The request body must be { session_id, input_log }.");
  }
  const { session_id: sessionId, input_log: inputLog } = value as Record<string, unknown>;
  if (typeof sessionId !== "string" || !isBattleSessionId(sessionId)) {
    return fail(400, "session_id must be a battle session id.");
  }

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
  if (!supabase || !admin) return fail(503, "Battle verification is unavailable right now.");
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (typeof userId !== "string" || userId === "") return fail(401, "Sign in to finish a battle.");

  const { data, error } = await admin
    .from("battle_sessions")
    .select(FINISH_SESSION_COLUMNS)
    .eq("id", sessionId)
    .overrideTypes<FinishSessionRow[], { merge: false }>();
  if (error) return fail(503, "This battle could not be loaded. Try again shortly.");

  const session = data?.[0];
  // Continue retries submit the original unmarked loss; the RPC checks the same paid turn.
  const verdict = verifyFinish(
    continuing && session ? { ...session, continued_turn: null } : session,
    userId,
    inputLog,
    new Date(),
    continuing ? "lose" : "either",
  );
  if (!verdict.ok) return fail(verdict.status, verdict.error);

  if (continuing) {
    const { error: continueError } = await admin.rpc("continue_battle", {
      p_session_id: sessionId,
      p_user_id: userId,
      p_turn: verdict.turns,
    });
    if (continueError?.code === "P0002") return fail(409, "This battle cannot continue again.");
    if (continueError?.code === "22023")
      return fail(422, "Continue unavailable. You need 5 gems and an eligible stage.");
    if (continueError) return fail(503, "Could not continue. Try again shortly.");
    return json(200, { ok: true });
  }

  const { data: rewards, error: claimError } = await admin.rpc(
    verdict.result === "win" ? "grant_battle_rewards" : "settle_battle_loss",
    {
      p_session_id: sessionId,
      p_remaining: verdict.remainingItems,
    },
  );
  if (claimError?.code === "P0002") return fail(409, "This battle is already finished.");
  if (claimError || !rewards)
    return fail(503, "This battle could not be finished. Try again shortly.");

  return json(200, {
    ok: true,
    session_id: sessionId,
    result: verdict.result,
    turns: verdict.turns,
    rewards,
  });
}
