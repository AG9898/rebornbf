import { isStarterUnitId } from "../onboarding/starters.ts";
import { isOwnedUnitId, unitContent } from "../units/owned-units.ts";
import type { LoggedTurn } from "./replay.ts";

export type StarterReward = {
  readonly ownedUnitId: string;
  readonly unitId: string;
  readonly formId: string;
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
  return {
    ownedUnitId: value.owned_unit_id,
    unitId: unit.id,
    formId: form.id,
    name: unit.name,
    rarity: form.rarity,
  };
}

export type UnitReward = { readonly unitId: string; readonly name: string; readonly count: number };

/** First-clear unit grants (`{unit id: count}`, e.g. Lantern Toads) named from content. */
function unitRewards(value: unknown): UnitReward[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
  const rewards: UnitReward[] = [];
  for (const [unitId, count] of Object.entries(value)) {
    const unit = unitContent(unitId);
    if (!unit || typeof count !== "number" || !Number.isInteger(count) || count < 1) continue;
    rewards.push({ unitId: unit.id, name: unit.name, count });
  }
  return rewards;
}

export type ItemReward = { readonly itemId: string; readonly count: number };

/** Dropped and first-clear items (`{item id: count}`), as settled; unknown shapes are dropped. */
function itemRewards(value: unknown): ItemReward[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
  const rewards: ItemReward[] = [];
  for (const [itemId, count] of Object.entries(value)) {
    if (typeof count !== "number" || !Number.isInteger(count) || count < 1) continue;
    rewards.push({ itemId, count });
  }
  return rewards;
}

/** A unit captured in battle (`acquire_unit`'s result): a stacked copy has no owned-unit row. */
export type CapturedUnit = {
  readonly unitId: string;
  readonly formId: string;
  readonly ownedUnitId: string | null;
};

function capturedUnits(value: unknown): CapturedUnit[] {
  if (!Array.isArray(value)) return [];
  const captured: CapturedUnit[] = [];
  for (const entry of value) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("unit_id" in entry) ||
      typeof entry.unit_id !== "string" ||
      !("form_id" in entry) ||
      typeof entry.form_id !== "string"
    )
      continue;
    const unit = unitContent(entry.unit_id);
    if (!unit?.forms.some((form) => form.id === entry.form_id)) continue;
    const owned =
      "owned_unit_id" in entry &&
      typeof entry.owned_unit_id === "string" &&
      isOwnedUnitId(entry.owned_unit_id)
        ? entry.owned_unit_id
        : null;
    captured.push({ unitId: unit.id, formId: entry.form_id, ownedUnitId: owned });
  }
  return captured;
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
        /** First-clear unit grants (the Lantern Toads). */
        readonly units?: readonly UnitReward[];
        /** Dropped, key, and first-clear items. */
        readonly items?: readonly ItemReward[];
        /** Units captured in battle. */
        readonly captured?: readonly CapturedUnit[];
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
      const units =
        body.rewards.first_clear && "first_clear_units" in body.rewards
          ? unitRewards(body.rewards.first_clear_units)
          : [];
      const items = "items" in body.rewards ? itemRewards(body.rewards.items) : [];
      const captured = "units" in body.rewards ? capturedUnits(body.rewards.units) : [];
      return {
        ok: true,
        turns: body.turns,
        rewards: {
          first_clear: body.rewards.first_clear,
          gems: body.rewards.gems,
          zel: body.rewards.zel,
          ...(starter ? { starter } : {}),
          ...(units.length > 0 ? { units } : {}),
          ...(items.length > 0 ? { items } : {}),
          ...(captured.length > 0 ? { captured } : {}),
        },
      };
    }
  } catch {
    // Network failures and non-JSON responses should leave the end screen usable.
  }
  return { ok: false, error: UNAVAILABLE };
}
