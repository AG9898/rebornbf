import { isStarterUnitId } from "../onboarding/starters.ts";
import { isOwnedUnitId, unitContent } from "../units/owned-units.ts";
import type { LoggedTurn } from "./replay.ts";

export type StarterReward = {
  readonly ownedUnitId: string;
  readonly name: string;
  readonly rarity: number;
};

/** A popup is allowed only for a server-confirmed first clear and a known starter form. */
function starterReward(value: unknown): StarterReward | undefined {
  if (
    typeof value !== "object" ||
    value === null ||
    !("owned_unit_id" in value) ||
    typeof value.owned_unit_id !== "string" ||
    !isOwnedUnitId(value.owned_unit_id) ||
    !("unit_id" in value) ||
    typeof value.unit_id !== "string" ||
    !("form_id" in value)
  )
    return undefined;
  const unit = unitContent(value.unit_id);
  if (!unit || !isStarterUnitId(value.unit_id)) return undefined;
  const form = unit.forms.find((form) => form.id === value.form_id);
  if (!form || typeof form.rarity !== "number" || form.rarity < 3 || form.rarity > 7)
    return undefined;
  return { ownedUnitId: value.owned_unit_id, name: unit.name, rarity: form.rarity };
}

export type Submission =
  | {
      readonly ok: true;
      readonly turns: number;
      readonly rewards: {
        readonly first_clear: boolean;
        readonly gems: number;
        readonly zel: number;
        readonly starter?: StarterReward;
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
      const starter =
        body.rewards.first_clear && "starter" in body.rewards
          ? starterReward(body.rewards.starter)
          : undefined;
      return {
        ok: true,
        turns: body.turns,
        rewards: {
          first_clear: body.rewards.first_clear,
          gems: body.rewards.gems,
          zel: body.rewards.zel,
          ...(starter ? { starter } : {}),
        },
      };
    }
  } catch {
    // Network failures and non-JSON responses should leave the end screen usable.
  }
  return { ok: false, error: UNAVAILABLE };
}
