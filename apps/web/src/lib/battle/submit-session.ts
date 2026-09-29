import type { LoggedTurn } from "./replay.ts";

export type Submission =
  | {
      readonly ok: true;
      readonly turns: number;
      readonly rewards: {
        readonly first_clear: boolean;
        readonly gems: number;
        readonly zel: number;
      };
    }
  | { readonly ok: false; readonly error: string };

const UNAVAILABLE = "Battle verification is unavailable right now. Return to quests and try again.";

/** Submit a completed session once the scene has shown its last event; only the route can award rewards. */
export async function submitSession(
  sessionId: string,
  log: readonly LoggedTurn[],
  request: typeof fetch = fetch,
): Promise<Submission> {
  try {
    const response = await request("/api/battles/finish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, input_log: log }),
    });
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) return { ok: false, error: UNAVAILABLE };
    if ("ok" in body && body.ok === false && "error" in body && typeof body.error === "string") {
      return { ok: false, error: body.error };
    }
    if (
      response.ok &&
      "ok" in body &&
      body.ok === true &&
      "result" in body &&
      body.result === "win" &&
      "turns" in body &&
      typeof body.turns === "number" &&
      "rewards" in body &&
      typeof body.rewards === "object" &&
      body.rewards !== null &&
      "first_clear" in body.rewards &&
      typeof body.rewards.first_clear === "boolean" &&
      "gems" in body.rewards &&
      typeof body.rewards.gems === "number" &&
      "zel" in body.rewards &&
      typeof body.rewards.zel === "number"
    ) {
      return {
        ok: true,
        turns: body.turns,
        rewards: {
          first_clear: body.rewards.first_clear,
          gems: body.rewards.gems,
          zel: body.rewards.zel,
        },
      };
    }
  } catch {
    // Network failures and non-JSON responses should leave the end screen usable.
  }
  return { ok: false, error: UNAVAILABLE };
}
