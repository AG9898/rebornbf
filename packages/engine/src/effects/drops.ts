import type { Effect } from "@bfr/data";
import type { BcDropBonuses } from "../drops/rates.ts";
import type { CollectModifiers } from "../drops/roll.ts";
import { type ActiveEffect, replaceBuff } from "./buffs.ts";
import { type EffectHandler, effectTotal } from "./gauge.ts";

/**
 * Drop effects (GAME_DESIGN §4 → Gauge and drop effects). Drop-rate bonuses are in % points
 * (20 = +20%); efficacies are fractions (0.75 = +75%).
 */
export const DROP_IDS = [
  "drop.bc",
  "drop.hc",
  "drop.item",
  "drop.zel",
  "hc.efficacy",
  "bc.efficacy",
] as const satisfies readonly Effect["id"][];

export type DropId = (typeof DROP_IDS)[number];

/** One registered handler per drop ID; all are lasting and use the BB/SBB vs UBB slot rule. */
export const DROP_HANDLERS: Readonly<Record<DropId, EffectHandler>> = {
  "drop.bc": replaceBuff,
  "drop.hc": replaceBuff,
  "drop.item": replaceBuff,
  "drop.zel": replaceBuff,
  "hc.efficacy": replaceBuff,
  "bc.efficacy": replaceBuff,
};

export function isDropId(id: Effect["id"]): id is DropId {
  return (DROP_IDS as readonly string[]).includes(id);
}

/**
 * The attacker's `drop.bc` effects as `bcDropRate` terms: BB/SBB slot → `burstBuff`, UBB slot →
 * `ubbBuff`, leader-skill and Extra Skill passives → `leaderSkills`.
 */
export function bcDropBonusesFromEffects(
  effects: readonly ActiveEffect[],
): Pick<BcDropBonuses, "burstBuff" | "ubbBuff" | "leaderSkills"> {
  return {
    burstBuff: effectTotal(effects, "drop.bc", "bb"),
    ubbBuff: effectTotal(effects, "drop.bc", "ubb"),
    leaderSkills: effectTotal(effects, "drop.bc", "passive"),
  };
}

/** The attacker's summed `drop.hc` bonus for `hcDropRate`. */
export function hcDropBonusFromEffects(effects: readonly ActiveEffect[]): number {
  return effectTotal(effects, "drop.hc");
}

/** Summed `drop.zel` bonus, in %, for the zel roll (zel drops are not rolled yet). */
export function zelDropBonusFromEffects(effects: readonly ActiveEffect[]): number {
  return effectTotal(effects, "drop.zel");
}

/** Summed `drop.item` bonus, in %, for item rolls (item drops are not rolled yet). */
export function itemDropBonusFromEffects(effects: readonly ActiveEffect[]): number {
  return effectTotal(effects, "drop.item");
}

/**
 * Collector efficacies for `collectCrystals`. `bb.fill_rate` ("BB gauge fill rate") is the wiki's
 * other name for BC efficacy, so both IDs add into the BC term.
 */
export function collectModifiersFromEffects(effects: readonly ActiveEffect[]): CollectModifiers {
  return {
    bcEfficacy: effectTotal(effects, "bc.efficacy") + effectTotal(effects, "bb.fill_rate"),
    hcEfficacy: effectTotal(effects, "hc.efficacy"),
  };
}
