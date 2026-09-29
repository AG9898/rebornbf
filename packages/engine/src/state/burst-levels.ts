import type { Burst, ConditionedEffect, Effect, EffectId, Form } from "@bfr/data";

/**
 * Burst levels (GAME_DESIGN §6 → Burst levels, RESOLVED-58). Transcribed BB and SBB values are
 * level 10; levels 1–9 scale them by `f(L) = (17 + L) / 27` and raise the gauge cost by up to 25%.
 * UBB has one level and always uses its kit values.
 */
export const MIN_BURST_LEVEL = 1;
export const MAX_BURST_LEVEL = 10;

/** A unit's BB and SBB levels in battle; omitted levels are 10 (kit values). */
export interface BurstLevels {
  readonly bb?: number;
  readonly sbb?: number;
}

/** Full-fill sentinels keep their kit value at every level. */
const FILL_INSTANT_SENTINEL = 999;
const HEAL_OVER_TIME_SENTINEL = 98_999;

/** Whole numbers: `value` of these IDs is a percent or an amount rounded to an integer. */
const INTEGER_VALUE_IDS: readonly EffectId[] = ["buff.add_ailment", "barrier"];
const INTEGER_VALUE_PREFIXES = ["ailment.inflict.", "drop."] as const;
/** `value` is an element index or a hit count, never scaled. */
const UNSCALED_VALUE_IDS: readonly EffectId[] = ["buff.add_element", "hits.add_normal"];
/** `min`/`max` are HP or BC integers drawn with `RandomBetween`, so they round to integers. */
const INTEGER_RANGE_IDS: readonly EffectId[] = [
  "heal.instant",
  "heal.over_time",
  "bb.fill_on_spark",
  "bb.fill_on_hit",
];

function assertLevel(level: number): void {
  if (!Number.isInteger(level) || level < MIN_BURST_LEVEL || level > MAX_BURST_LEVEL) {
    throw new RangeError(`burst level must be an integer 1–10 (got ${level})`);
  }
}

/** Rounds half away from zero to `decimals` places, absorbing binary float noise first. */
function roundHalfUp(x: number, decimals: number): number {
  const scale = 10 ** decimals;
  const scaled = Number((Math.abs(x) * scale).toPrecision(12));
  const rounded = (Math.sign(x) * Math.floor(scaled + 0.5)) / scale;
  return rounded === 0 ? 0 : rounded;
}

/** `v × f(L)`, rounded half up to an integer or to 3 decimals. */
function scaleNumber(v: number, level: number, integer: boolean): number {
  return roundHalfUp((v * (17 + level)) / 27, integer ? 0 : 3);
}

/** BC cost at level L: `ceil(cost₁₀ × (1 + 0.25 × (10 − L) / 9))`, i.e. `ceil(cost₁₀ × (46 − L) / 36)`. */
export function burstCostAtLevel(cost10: number, level: number): number {
  assertLevel(level);
  return Math.ceil((cost10 * (46 - level)) / 36);
}

function valueIsInteger(id: EffectId): boolean {
  return INTEGER_VALUE_IDS.includes(id) || INTEGER_VALUE_PREFIXES.some((p) => id.startsWith(p));
}

function valueIsUnscaled(id: EffectId, value: number): boolean {
  if (UNSCALED_VALUE_IDS.includes(id)) return true;
  if (id === "bb.fill_instant") return value >= FILL_INSTANT_SENTINEL;
  return id === "heal.over_time" && value >= HEAL_OVER_TIME_SENTINEL;
}

function scaleRangeEnd(id: EffectId, v: number, level: number): number {
  if (id === "heal.over_time" && v >= HEAL_OVER_TIME_SENTINEL) return v;
  return scaleNumber(v, level, INTEGER_RANGE_IDS.includes(id));
}

/**
 * One effect at burst level L. Scaled: `value` (except element indexes, hit counts, and full-fill
 * sentinels), `hpScaling`, `damageBonus`, `recBonus`, `min`/`max` (3 decimals, or integers on HP
 * and BC ranges), and `chance`, `flatAtk`, `critRate`, `bcDrop` (integers). Kept: `turns`,
 * `threshold`, targets, elements, ailment kinds, and stats.
 */
function scaleEffect<E extends Effect | ConditionedEffect>(effect: E, level: number): E {
  const { id } = effect;
  const scaled: E = {
    ...effect,
    value: valueIsUnscaled(id, effect.value)
      ? effect.value
      : scaleNumber(effect.value, level, valueIsInteger(id)),
  };
  const fraction = ["hpScaling", "damageBonus", "recBonus"] as const;
  for (const field of fraction) {
    const v = effect[field];
    if (v !== undefined) scaled[field] = scaleNumber(v, level, false);
  }
  const whole = ["chance", "flatAtk", "critRate", "bcDrop"] as const;
  for (const field of whole) {
    const v = effect[field];
    if (v !== undefined) scaled[field] = scaleNumber(v, level, true);
  }
  if (effect.min !== undefined) scaled.min = scaleRangeEnd(id, effect.min, level);
  if (effect.max !== undefined) scaled.max = scaleRangeEnd(id, effect.max, level);
  if ("effects" in effect && effect.effects !== undefined) {
    (scaled as Effect).effects = effect.effects.map((gated) => scaleEffect(gated, level));
  }
  return scaled;
}

/** A BB or SBB at level L (1–10); level 10 returns the kit values unchanged. */
export function burstAtLevel(burst: Burst, level: number): Burst {
  assertLevel(level);
  if (level === MAX_BURST_LEVEL) return burst;
  return {
    ...burst,
    cost: burstCostAtLevel(burst.cost, level),
    effects: burst.effects.map((effect) => scaleEffect(effect, level)),
  };
}

/**
 * The form a unit fights with at the given burst levels: BB and SBB scaled, UBB unchanged but only
 * kept when BB and SBB (on forms that have one) are both level 10 — the UBB unlock rule.
 */
export function formAtBurstLevels(form: Form, levels: BurstLevels = {}): Form {
  const bbLevel = levels.bb ?? MAX_BURST_LEVEL;
  const sbbLevel = levels.sbb ?? MAX_BURST_LEVEL;
  assertLevel(bbLevel);
  assertLevel(sbbLevel);
  if (bbLevel === MAX_BURST_LEVEL && sbbLevel === MAX_BURST_LEVEL) return form;
  const { bb, sbb } = form.bursts;
  const ubbUnlocked = bbLevel === MAX_BURST_LEVEL && (!sbb || sbbLevel === MAX_BURST_LEVEL);
  return {
    ...form,
    bursts: {
      bb: burstAtLevel(bb, bbLevel),
      ...(sbb ? { sbb: burstAtLevel(sbb, sbbLevel) } : {}),
      ...(ubbUnlocked && form.bursts.ubb ? { ubb: form.bursts.ubb } : {}),
    },
  };
}
