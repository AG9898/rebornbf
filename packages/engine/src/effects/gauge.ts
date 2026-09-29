import type { Effect, Form } from "@bfr/data";
import { gaugeMax } from "../drops/roll.ts";
import type { GaugeModifiers } from "../gauge/index.ts";
import { nextInt, type RngDraw, type RngState } from "../rng.ts";
import { type ActiveEffect, effectSlot, replaceBuff } from "./buffs.ts";

/**
 * Gauge effects (GAME_DESIGN §4 → Gauge and drop effects). BC amounts are in BC; rates and
 * reductions are fractions (0.2 = 20%).
 */
export const GAUGE_IDS = [
  "bb.fill_instant",
  "bb.fill_per_turn",
  "bb.fill_rate",
  "bb.fill_on_hit",
  "bb.fill_on_guard",
  "bb.fill_on_damage_taken",
  "bb.fill_on_spark",
  "bb.fill_on_damage_dealt",
  "bb.cost_reduction",
  "bb.consumption_reduction",
  "od.fill_rate",
  "od.fill_instant",
] as const satisfies readonly Effect["id"][];

export type GaugeId = (typeof GAUGE_IDS)[number];
export type EffectHandler = (
  effects: readonly ActiveEffect[],
  effect: ActiveEffect,
) => ActiveEffect[];

/** Instant fills change the BB or OD gauge at burst start; nothing is stored. */
const instant: EffectHandler = (effects) => [...effects];

/** One registered handler per gauge ID. Lasting ones use the BB/SBB vs UBB slot rule. */
export const GAUGE_HANDLERS: Readonly<Record<GaugeId, EffectHandler>> = {
  "bb.fill_instant": instant,
  "bb.fill_per_turn": replaceBuff,
  "bb.fill_rate": replaceBuff,
  "bb.fill_on_hit": replaceBuff,
  "bb.fill_on_guard": replaceBuff,
  "bb.fill_on_damage_taken": replaceBuff,
  // Filled per sparked hit by `rollBcFillOnSpark` (effects/spark.ts).
  "bb.fill_on_spark": replaceBuff,
  // Filled per landed party hit by `bcFillOnDamageDealt` (step.ts).
  "bb.fill_on_damage_dealt": replaceBuff,
  "bb.cost_reduction": replaceBuff,
  "bb.consumption_reduction": replaceBuff,
  "od.fill_rate": replaceBuff,
  "od.fill_instant": instant,
};

export function isGaugeId(id: Effect["id"]): id is GaugeId {
  return (GAUGE_IDS as readonly string[]).includes(id);
}

/** Sum of every active value of `id`, optionally limited to the BB/SBB or UBB slot. */
export function effectTotal(
  effects: readonly ActiveEffect[],
  id: Effect["id"],
  slot?: "bb" | "ubb" | "passive",
): number {
  return effects.reduce(
    (total, effect) =>
      total +
      (effect.id === id && (slot === undefined || effectSlot(effect) === slot) ? effect.value : 0),
    0,
  );
}

/** Active BC cost reduction and BB consumption reduction for `burstThreshold` / `gaugeAfterBurst`. */
export function gaugeModifiersFromEffects(effects: readonly ActiveEffect[]): GaugeModifiers {
  return {
    costReduction: effectTotal(effects, "bb.cost_reduction"),
    consumptionReduction: effectTotal(effects, "bb.consumption_reduction"),
  };
}

/**
 * The BB consumption reduction share refunded by one burst (GAME_DESIGN §4 Kit additions
 * (M2-04E)): each active `bb.consumption_reduction`, in stored order, adds its `value`, or, with a
 * whole-percent `min`/`max` range, draws `RandomBetween(min, max)` percent. Drawn once per
 * accepted burst, before any of its effects apply (the burst's first RNG draw).
 */
export function rollConsumptionReduction(
  effects: readonly ActiveEffect[],
  rng: RngState,
): RngDraw<number> {
  let share = 0;
  let current = rng;
  for (const effect of effects) {
    if (effect.id !== "bb.consumption_reduction") continue;
    if (effect.min === undefined || effect.max === undefined) {
      share += effect.value;
      continue;
    }
    const pct = nextInt(current, Math.round(effect.min * 100), Math.round(effect.max * 100));
    current = pct.rng;
    share += pct.value / 100;
  }
  return { value: share, rng: current };
}

/** OD fill rate for `actionOdYield` / `turnEndOdYield`. */
export function odFillRate(effects: readonly ActiveEffect[]): number {
  return effectTotal(effects, "od.fill_rate");
}

/**
 * BC filled at the end-of-turn step 3 (§2) by active `bb.fill_per_turn` and passive
 * `passive.bc_per_turn` (turn loop: M1-07B).
 */
export function bcFillPerTurn(effects: readonly ActiveEffect[]): number {
  return Math.max(
    0,
    effectTotal(effects, "bb.fill_per_turn") + effectTotal(effects, "passive.bc_per_turn"),
  );
}

/**
 * BC filled once per enemy attack that damages the unit (`bb.fill_on_hit`, *BC Fill when
 * attacked*; GAME_DESIGN §4 Kit additions (M2-04H)): each active effect, in stored order, adds its
 * `value`, or, with an integer `min`/`max` range, draws `RandomBetween(min, max)` BC.
 */
export function rollBcFillWhenAttacked(
  effects: readonly ActiveEffect[],
  rng: RngState,
): RngDraw<number> {
  let fill = 0;
  let current = rng;
  for (const effect of effects) {
    if (effect.id !== "bb.fill_on_hit") continue;
    if (effect.min === undefined || effect.max === undefined) {
      fill += effect.value;
      continue;
    }
    const draw = nextInt(current, effect.min, effect.max);
    current = draw.rng;
    fill += draw.value;
  }
  return { value: Math.max(0, fill), rng: current };
}

/**
 * Whether a damage-taken tally moving from `before` to `after` reaches a new multiple of
 * `threshold` (GAME_DESIGN §4 Kit additions (M2-04C)): triggers at most once per landed hit.
 */
export function crossesThreshold(before: number, after: number, threshold: number): boolean {
  return threshold > 0 && Math.floor(after / threshold) > Math.floor(before / threshold);
}

/** Σ `value` of every active `id` whose `threshold` the tally crosses from `before` to `after`. */
function thresholdFill(
  effects: readonly ActiveEffect[],
  id: "bb.fill_on_damage_taken" | "bb.fill_on_damage_dealt",
  before: number,
  after: number,
): number {
  return effects.reduce(
    (total, effect) =>
      total +
      (effect.id === id && crossesThreshold(before, after, effect.threshold ?? 0)
        ? effect.value
        : 0),
    0,
  );
}

/**
 * BC filled by `bb.fill_on_damage_taken` when a hit moves the unit's damage-taken tally from
 * `before` to `after`: every effect whose `threshold` is crossed adds its `value` (they stack).
 */
export function bcFillOnDamageTaken(
  effects: readonly ActiveEffect[],
  before: number,
  after: number,
): number {
  return thresholdFill(effects, "bb.fill_on_damage_taken", before, after);
}

/**
 * BC filled by `bb.fill_on_damage_dealt` when a landed hit moves the attacker's damage-dealt
 * tally from `before` to `after` (GAME_DESIGN §4 Kit additions (M2-04F)): every effect whose
 * `threshold` is crossed adds its `value` (they stack).
 */
export function bcFillOnDamageDealt(
  effects: readonly ActiveEffect[],
  before: number,
  after: number,
): number {
  return thresholdFill(effects, "bb.fill_on_damage_dealt", before, after);
}

/** BC filled when the unit guards (`bb.fill_on_guard`). */
export function bcFillOnGuard(effects: readonly ActiveEffect[]): number {
  return Math.max(0, effectTotal(effects, "bb.fill_on_guard"));
}

export interface GaugeHolder {
  readonly form: Form;
  readonly bc: number;
  readonly hp: number;
  readonly overdrive?: boolean;
  readonly effects?: readonly ActiveEffect[];
}

/**
 * Adds effect BC fill (not boosted by BC efficacy) to a living unit's gauge, clamped to
 * `[0, gaugeMax]`. A KO'd or cursed unit gains nothing. Returns the new gauge.
 */
export function fillGauge(unit: GaugeHolder, amount: number): number {
  if (unit.hp <= 0 || unit.effects?.some((effect) => effect.id === "ailment.inflict.curse")) {
    return unit.bc;
  }
  return Math.min(gaugeMax(unit.form, unit.overdrive), Math.max(0, unit.bc + amount));
}
