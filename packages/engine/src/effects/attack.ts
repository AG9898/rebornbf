import { type Burst, type Effect, type Element, type EnemySkill, isAttackShapeId } from "@bfr/data";
import { floorDamage } from "../formulas/rounding.ts";
import { nextInt, type RngDraw, type RngState } from "../rng.ts";
import type { BattleEnemy, EnemySlotId } from "../state/types.ts";
import { type ActiveEffect, effectSlot, replaceBuff } from "./buffs.ts";
import type { EffectHandler } from "./gauge.ts";

/**
 * Attack effects (GAME_DESIGN §4 → Attack effects). Attack shapes (`attack.aoe`, `attack.st`,
 * `attack.random`, `attack.hp_scaled`, `attack.element_target`) describe a burst's attacks and
 * store nothing; `attack.def_ignore` and `hits.add_normal` are lasting buffs (buff slot rule).
 */
export const ATTACK_IDS = [
  "attack.aoe",
  "attack.st",
  "attack.random",
  "attack.hp_scaled",
  "attack.def_ignore",
  "attack.element_target",
  "hits.add_normal",
] as const satisfies readonly Effect["id"][];

export type AttackId = (typeof ATTACK_IDS)[number];

export function isAttackId(id: Effect["id"]): id is AttackId {
  return (ATTACK_IDS as readonly string[]).includes(id);
}

/** Attack shapes are read from the burst's effect list when it acts; applying one stores nothing. */
const shape: EffectHandler = (effects: readonly ActiveEffect[]) => [...effects];

/** One registered handler per attack ID. */
export const ATTACK_HANDLERS: Readonly<Record<AttackId, EffectHandler>> = {
  "attack.aoe": shape,
  "attack.st": shape,
  "attack.random": shape,
  "attack.hp_scaled": shape,
  "attack.element_target": shape,
  "attack.def_ignore": replaceBuff,
  "hits.add_normal": replaceBuff,
};

/** How one frame-timed attack picks its targets and BB damage modifier. */
export interface AttackPlan {
  /** `single`: the selected foe; `all`: every living foe; `random`: a random foe per hit. */
  readonly area: "single" | "all" | "random";
  /** Base BB damage modifier (fraction, 350% → 3.5). */
  readonly modifier: number;
  /** HP-scaling modifier, added × (current HP / max HP). */
  readonly hpScaling: number;
  /** Flat ATK added to base ATK before the % sum (GAME_DESIGN §3 `flat_atk`). */
  readonly flatAtk?: number;
  /** Only foes of this element are hit. */
  readonly element?: Element;
  /** The attack's own BC drop-rate bonus in % points (`bcDrop`: the §2 `inherent` term). */
  readonly bcDrop?: number;
  /** The attack's own crit-rate bonus in % points (`critRate`), added to the crit-rate buffs. */
  readonly critRate?: number;
}

/** A normal attack: the selected foe, no BB modifier. */
export const NORMAL_ATTACK_PLAN: AttackPlan = { area: "single", modifier: 0, hpScaling: 0 };

/**
 * Pairs each of a burst's (or enemy skill's) attacks with its attack-shape effect, in order. An
 * attack with no shape effect (engine tests only; content validation requires one) is a
 * single-target attack with no BB modifier.
 */
export function attackPlans(skill: Pick<Burst | EnemySkill, "attacks" | "effects">): AttackPlan[] {
  const shapes = skill.effects.filter((effect) => isAttackShapeId(effect.id));
  return skill.attacks.map((_, i) => {
    const effect = shapes[i];
    if (!effect) return NORMAL_ATTACK_PLAN;
    return {
      area:
        effect.id === "attack.random" ? "random" : effect.target === "enemies" ? "all" : "single",
      modifier: effect.value,
      hpScaling: effect.hpScaling ?? 0,
      ...(effect.flatAtk ? { flatAtk: effect.flatAtk } : {}),
      ...(effect.bcDrop ? { bcDrop: effect.bcDrop } : {}),
      ...(effect.critRate ? { critRate: effect.critRate } : {}),
      ...(effect.id === "attack.element_target" && effect.element
        ? { element: effect.element }
        : {}),
    };
  });
}

/**
 * The attack's BB damage modifier: `base + hpScaling × (hp / maxHp)`, with the resulting percent
 * rounded down (BF Wiki *HP-scaled Damage*). Without HP scaling it is the base modifier.
 */
export function bbModifier(plan: AttackPlan, hp: number, maxHp: number): number {
  if (plan.hpScaling === 0 || maxHp <= 0) return plan.modifier;
  const ratio = Math.min(1, Math.max(0, hp / maxHp));
  return floorDamage((plan.modifier + plan.hpScaling * ratio) * 100) / 100;
}

/**
 * The foes an attack hits, in slot order: every living foe (`all`), or the selected one
 * (`single`), limited to `plan.element` when set. Random attacks pick per hit (`pickRandomFoe`).
 */
export function planTargets(
  plan: AttackPlan,
  enemies: readonly BattleEnemy[],
  selected: EnemySlotId,
): BattleEnemy[] {
  return enemies.filter(
    (enemy) =>
      enemy.hp > 0 &&
      (plan.area !== "single" || enemy.slot === selected) &&
      (plan.element === undefined || enemy.element === plan.element),
  );
}

/** Draws one integer in `[0, n − 1]` to pick a random attack's target for one hit. */
export function pickRandomFoe<T>(rng: RngState, foes: readonly T[]): RngDraw<T | undefined> {
  if (foes.length === 0) return { value: undefined, rng };
  const draw = nextInt(rng, 0, foes.length - 1);
  return { value: foes[draw.value], rng: draw.rng };
}

/** Summed `attack.def_ignore` chance in %, capped at 100. */
export function defIgnoreChance(effects: readonly ActiveEffect[]): number {
  const total = effects.reduce(
    (sum, effect) => sum + (effect.id === "attack.def_ignore" ? effect.value : 0),
    0,
  );
  return Math.min(100, total);
}

/**
 * Rolls DEF ignore for one attack computation: always at ≥ 100%, never at 0, otherwise one integer
 * draw in `[0, 99]` that ignores DEF when below the chance (as ailment infliction rolls).
 */
export function rollDefIgnore(rng: RngState, chance: number): RngDraw<boolean> {
  if (chance >= 100) return { value: true, rng };
  if (chance <= 0) return { value: false, rng };
  const draw = nextInt(rng, 0, 99);
  return { value: draw.value < chance, rng: draw.rng };
}

/** One source of extra normal-attack hits (*Hit Count Boost*). */
export interface ExtraHitSource {
  /** Clones added per normal hit. */
  readonly count: number;
  /** Damage multiplier of each clone: `1 + damageBonus`. */
  readonly multiplier: number;
  /** Passive sources (leader skill, Extra Skill) roll drops on their clones; burst buffs do not. */
  readonly drops: boolean;
}

/** Active `hits.add_normal` effects, in effect order. */
export function extraHitSources(effects: readonly ActiveEffect[]): ExtraHitSource[] {
  return effects.flatMap((effect) =>
    effect.id === "hits.add_normal"
      ? [
          {
            count: effect.value,
            multiplier: 1 + (effect.damageBonus ?? 0),
            drops: effectSlot(effect) === "passive",
          },
        ]
      : [],
  );
}

/**
 * An attack's crit rate as a fraction (GAME_DESIGN §2 Critical hits): the attacker's
 * `buff.crit_rate` total plus the attack shape's own `critRate` (% points; RESOLVED-49), scaled by the
 * target's `crit_resist`. A rate at or above 1 always crits.
 */
export function attackCritRate(buffRate: number, critRate: number, critResist: number): number {
  return (buffRate + critRate / 100) * (1 - critResist);
}
