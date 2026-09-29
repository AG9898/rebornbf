import type { Form } from "@bfr/data";
import { nextFloat, nextInt, type RngDraw, type RngState } from "../rng.ts";
import {
  bcCrystalFill,
  DROP_ROLL_MAX,
  dropSpawns,
  HC_DIVISOR_MAX,
  HC_DIVISOR_MIN,
  hcHeal,
} from "./rates.ts";

/** Crystals one hit spawned, with the HC heal divisors drawn for them. */
export interface HitDrops {
  readonly bc: number;
  readonly hc: number;
  /** One divisor per HC, in [3.0, 4.2). */
  readonly hcDivisors: readonly number[];
}

export interface HitDropParams {
  /** Drop checks this hit rolls: the attack's `dropChecks / hits`. */
  readonly checks: number;
  readonly bcRate: number;
  readonly hcRate: number;
}

/** Counts the BC spawned by drop-check draws against one rate (reference cases use fixed draws). */
export function countBcDrops(draws: readonly number[], rate: number): number {
  return draws.filter((draw) => dropSpawns(draw, rate)).length;
}

/** Draws an HC heal divisor, continuous in `[3.0, 4.2)` (RESOLVED-38 item 7). */
export function rollHcDivisor(rng: RngState): RngDraw<number> {
  const draw = nextFloat(rng);
  return {
    value: HC_DIVISOR_MIN + (HC_DIVISOR_MAX - HC_DIVISOR_MIN) * draw.value,
    rng: draw.rng,
  };
}

/**
 * Rolls one hit's crystal drops from the battle RNG, in this order: one integer draw in
 * `[0, 100]` per BC drop check, one for the HC roll, then an HC divisor draw if an HC spawned.
 * Every check draws even when its rate makes the outcome certain, so the draw count depends only
 * on the hit's check count and HC outcome.
 */
export function rollHitDrops(rng: RngState, params: HitDropParams): RngDraw<HitDrops> {
  let current = rng;
  const bcDraws: number[] = [];
  for (let i = 0; i < params.checks; i++) {
    const draw = nextInt(current, 0, DROP_ROLL_MAX);
    current = draw.rng;
    bcDraws.push(draw.value);
  }
  const hcDraw = nextInt(current, 0, DROP_ROLL_MAX);
  current = hcDraw.rng;
  const hcDivisors: number[] = [];
  if (dropSpawns(hcDraw.value, params.hcRate)) {
    const divisor = rollHcDivisor(current);
    current = divisor.rng;
    hcDivisors.push(divisor.value);
  }
  return {
    value: { bc: countBcDrops(bcDraws, params.bcRate), hc: hcDivisors.length, hcDivisors },
    rng: current,
  };
}

/**
 * Gauge maximum in BC: `bbCost + sbbCost` for forms with SBB, else `bbCost` (GAME_DESIGN §2 BB
 * gauge tiers, RESOLVED-38 item 8 working reading). While in Overdrive Mode the cap is at least UBB
 * cost, so that tier can be charged even if its cost exceeds the ordinary gauge limit.
 */
export function gaugeMax(form: Form, overdrive = false): number {
  const normalMax = form.bursts.bb.cost + (form.bursts.sbb?.cost ?? 0);
  return overdrive ? Math.max(normalMax, form.bursts.ubb?.cost ?? 0) : normalMax;
}

export interface Collector {
  readonly form: Form;
  readonly maxHp: number;
  readonly hp: number;
  readonly bc: number;
  readonly overdrive?: boolean;
  /** REC after stat modifiers. */
  readonly recTotal: number;
}

export interface CollectModifiers {
  readonly bcEfficacy?: number;
  readonly hcEfficacy?: number;
}

export interface Collection {
  /** Gauge after collecting, clamped to [0, gaugeMax]. */
  readonly bc: number;
  /** HP after healing, clamped to max HP. */
  readonly hp: number;
  /** Gauge change actually applied. */
  readonly bcGained: number;
  /** HP actually restored. */
  readonly healed: number;
}

/**
 * Credits a hit's crystals to the collector: BC fills the gauge by `count × (1 + BC efficacy)`
 * (clamped to the gauge range), each HC heals `floor(REC × (1 + HC efficacy) / divisor)` (capped
 * at max HP). A defeated collector gains nothing.
 */
export function collectCrystals(
  collector: Collector,
  drops: HitDrops,
  modifiers: CollectModifiers = {},
): Collection {
  if (collector.hp <= 0) {
    return { bc: collector.bc, hp: collector.hp, bcGained: 0, healed: 0 };
  }
  const fill = bcCrystalFill(drops.bc, modifiers.bcEfficacy ?? 0);
  const bc = Math.min(
    gaugeMax(collector.form, collector.overdrive),
    Math.max(0, collector.bc + fill),
  );
  const heal = drops.hcDivisors.reduce(
    (total, divisor) => total + hcHeal(collector.recTotal, divisor, modifiers.hcEfficacy ?? 0),
    0,
  );
  const hp = Math.min(collector.maxHp, collector.hp + heal);
  return { bc, hp, bcGained: bc - collector.bc, healed: hp - collector.hp };
}
