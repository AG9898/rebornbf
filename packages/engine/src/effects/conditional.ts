import type { Effect } from "@bfr/data";
import type { ActiveEffect } from "./buffs.ts";
import type { EffectHandler } from "./gauge.ts";

/**
 * Conditional effects (GAME_DESIGN §4 → Passives and conditions). A `cond.*` effect in a leader
 * skill or Extra Skill gates its `effects`: they are active on a recipient only while the
 * condition holds for that recipient, re-evaluated by `refreshPassives`.
 */
export const COND_IDS = [
  "cond.hp_above",
  "cond.hp_below",
  "cond.after_hc_collected",
  "cond.sphere_type_equipped",
  "cond.first_turns",
  "cond.signature_sphere",
  "cond.bb_above",
] as const satisfies readonly Effect["id"][];

export type CondId = (typeof COND_IDS)[number];

export function isCondId(id: Effect["id"]): id is CondId {
  return (COND_IDS as readonly string[]).includes(id);
}

/** Conditions gate skill passives only; one in a burst's effect list stores nothing. */
const inert: EffectHandler = (effects: readonly ActiveEffect[]) => [...effects];

/** One registered handler per condition ID. */
export const COND_HANDLERS: Readonly<Record<CondId, EffectHandler>> = {
  "cond.hp_above": inert,
  "cond.hp_below": inert,
  "cond.after_hc_collected": inert,
  "cond.sphere_type_equipped": inert,
  "cond.first_turns": inert,
  "cond.signature_sphere": inert,
  "cond.bb_above": inert,
};

/** The recipient and battle state a condition reads. */
export interface ConditionContext {
  readonly hp: number;
  readonly maxHp: number;
  /** 1-based battle turn. */
  readonly turn: number;
  /** The recipient's BB gauge (BC) and its form's BB cost, the length "BB gauge %" measures. */
  readonly bc: number;
  readonly bbCost: number;
  readonly signatureSphere?: boolean;
}

/**
 * The BB gauge fill fraction for `cond.bb_above` (BF Wiki *BB-conditional Parameter Boost*: "Having
 * the SBB gauge not filled completely is considered 100% BB gauge filled"): `bc / bbCost`, capped
 * at 1. The cost is the form's unreduced BB cost (RESOLVED-50 item 4).
 */
export function bbGaugeFraction(bc: number, bbCost: number): number {
  return bbCost > 0 ? Math.min(1, Math.max(0, bc) / bbCost) : 0;
}

/**
 * Whether a condition holds:
 * - `cond.hp_above`: HP > `value` × max HP (`value` is a fraction; 0.5 = "HP > 50%").
 * - `cond.hp_below`: HP < `value` × max HP.
 * - `cond.first_turns`: battle turn ≤ `value`.
 * - `cond.signature_sphere`: the recipient wears its own signature sphere.
 * - `cond.after_hc_collected`, `cond.sphere_type_equipped`: not tracked yet.
 * - `cond.bb_above`: BB gauge fraction (`bbGaugeFraction`) > `value` (GAME_DESIGN §4 → Kit
 *   additions (M2-04H)).
 */
export function conditionHolds(
  effect: Pick<Effect, "id" | "value">,
  context: ConditionContext,
): boolean {
  switch (effect.id) {
    case "cond.hp_above":
      return context.hp > context.maxHp * effect.value;
    case "cond.hp_below":
      return context.hp < context.maxHp * effect.value;
    case "cond.first_turns":
      return context.turn <= effect.value;
    case "cond.bb_above":
      return bbGaugeFraction(context.bc, context.bbCost) > effect.value;
    case "cond.signature_sphere":
      return context.signatureSphere === true;
    default:
      return false;
  }
}
