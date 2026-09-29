import { isCursed, isParalyzed } from "./effects/ailments.ts";
import { gaugeModifiersFromEffects } from "./effects/gauge.ts";
import { canBurst } from "./gauge/index.ts";
import type { BattleState, BattleUnit, EnemySlotId } from "./state/types.ts";
import type { BattleInput, BurstTier } from "./timeline/types.ts";

/** Burst tiers auto mode tries, highest first. */
const AUTO_TIERS: readonly BurstTier[] = ["ubb", "sbb", "bb"];

export interface AutoOptions {
  /** Selected enemy sent with every action; omitted, the engine picks the first living enemy. */
  readonly target?: EnemySlotId;
}

/**
 * The highest burst tier `unit` can use right now (UBB in Overdrive Mode, then SBB, then BB), or
 * `undefined` when none is charged or the unit is Cursed. Mirrors the engine's burst checks.
 */
export function autoBurstTier(unit: BattleUnit): BurstTier | undefined {
  if (isCursed(unit.effects)) return undefined;
  const modifiers = gaugeModifiersFromEffects(unit.effects);
  return AUTO_TIERS.find((tier) => canBurst(unit.form, tier, unit.bc, unit.overdrive, modifiers));
}

/**
 * Auto-battle (GAME_DESIGN §2 Player phase, RESOLVED-17): one input per unit that can still act
 * this player phase, in squad order (ally last), all at `state.tick`. Each unit uses its highest
 * available burst tier, else a normal attack. Dead, paralyzed, and already-acted units are skipped;
 * auto mode never guards or activates Overdrive. Pure: the output is ordinary `BattleInput`s, so an
 * auto turn replays exactly like a manual one. Returns `[]` once the battle is over.
 */
export function autoInputs(state: BattleState, options: AutoOptions = {}): BattleInput[] {
  if (state.result !== undefined) return [];
  const target = options.target === undefined ? {} : { target: options.target };
  return state.party
    .filter((unit) => unit.hp > 0 && !state.acted.includes(unit.slot) && !isParalyzed(unit.effects))
    .map((unit): BattleInput => {
      const tier = autoBurstTier(unit);
      return tier
        ? { type: "burst", tick: state.tick, actor: unit.slot, tier, ...target }
        : { type: "attack", tick: state.tick, actor: unit.slot, ...target };
    });
}
