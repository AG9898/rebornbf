import type { Attack, Effect } from "@bfr/data";
import { bcDropRate, hcDropRate } from "./drops/rates.ts";
import { collectCrystals, rollHitDrops } from "./drops/roll.ts";
import {
  isCursed,
  isInflictId,
  isParalyzed,
  rollAddedAilments,
  rollInfliction,
  statPenalty,
} from "./effects/ailments.ts";
import {
  type AttackPlan,
  attackCritRate,
  attackPlans,
  bbModifier,
  defIgnoreChance,
  extraHitSources,
  NORMAL_ATTACK_PLAN,
  pickRandomFoe,
  planTargets,
  rollDefIgnore,
} from "./effects/attack.ts";
import {
  type ActiveEffect,
  addedElements,
  type BurstSource,
  buffTotal,
  clearSlotEffects,
  defConversionAtk,
  isSetBuffId,
} from "./effects/buffs.ts";
import {
  bcDropBonusesFromEffects,
  collectModifiersFromEffects,
  hcDropBonusFromEffects,
} from "./effects/drops.ts";
import {
  bcFillOnDamageDealt,
  bcFillOnGuard,
  fillGauge,
  gaugeModifiersFromEffects,
  odFillRate,
  rollConsumptionReduction,
} from "./effects/gauge.ts";
import { applyEffect, endedEffectIds } from "./effects/index.ts";
import { hpScaledAtkTotal, passiveStatTotal } from "./effects/passive.ts";
import { rollBcFillOnSpark, rollSparkCritical, sparkVulnerability } from "./effects/spark.ts";
import {
  burstHealAmount,
  critResistance,
  elementalWeaknessResistance,
  hpDrainAmount,
} from "./effects/survival.ts";
import type {
  ActionRejectedReason,
  BattleEvent,
  BurstUsedEvent,
  CrystalDroppedEvent,
  EffectAppliedEvent,
  EffectEndedEvent,
  EnemyDefeatedEvent,
  GaugeFilledEvent,
  HealedEvent,
  HitLandedEvent,
  SparkedEvent,
} from "./events.ts";
import { attackTotal } from "./formulas/attack-stat.ts";
import { attackCore, hitDamage, rollAttack } from "./formulas/damage.ts";
import { elementMultiplier, elementOutcome, isStrongAgainst } from "./formulas/element.ts";
import { sparkDropBonus, sparkMultiplier } from "./formulas/spark.ts";
import { canBurst, gaugeAfterBurst } from "./gauge/index.ts";
import {
  actionOdYield,
  activateOd,
  addOd,
  instantOdFill,
  isOdFull,
  type OdGauge,
  OVERDRIVE_STAT_BONUS,
  OVERDRIVE_TURNS,
} from "./gauge/overdrive.ts";
import { nextInt, type RngState } from "./rng.ts";
import type { BattleEnemy, BattleState, BattleUnit, EnemySlotId } from "./state/types.ts";
import { cloneExtraHits, type HitOrigin, insertHits, scheduleHit } from "./timeline/schedule.ts";
import { detectSparks } from "./timeline/spark.ts";
import type {
  AttackDamage,
  AttackInput,
  BattleInput,
  BurstInput,
  GuardInput,
  OverdriveInput,
  ScheduledHit,
} from "./timeline/types.ts";

/** A normal attack's single plan (identity marks "normal attack" for extra hits). */
const NORMAL_PLANS: readonly AttackPlan[] = [NORMAL_ATTACK_PLAN];

/** Thrown when an input is malformed (bad tick, unknown slot); the message names the input. */
export class BattleInputError extends Error {
  override readonly name = "BattleInputError";
}

export interface StepOptions {
  /**
   * Advance the clock to this tick (inclusive), resolving everything due by then. Omitted: run
   * until every input is processed and the timeline is empty.
   */
  readonly untilTick?: number;
}

export interface StepResult {
  readonly state: BattleState;
  readonly events: readonly BattleEvent[];
}

interface Mutable {
  rng: RngState;
  party: BattleUnit[];
  enemies: BattleEnemy[];
  timeline: ScheduledHit[];
  nextActionId: number;
  od: OdGauge;
  acted: BattleState["acted"][number][];
}

/** Overdrive Mode adds +100% to ATK, DEF, and REC `stat_mods` (RESOLVED-38 item 10). */
function overdriveBonus(unit: BattleUnit): number {
  return unit.overdrive ? OVERDRIVE_STAT_BONUS : 0;
}

/**
 * REC `stat_mods`: `buff.rec` plus leader-skill/Extra Skill REC passives, minus Sick, plus the
 * Overdrive Mode bonus.
 */
export function recStatMods(unit: BattleUnit): number {
  return (
    buffTotal(unit.effects, "buff.rec") +
    passiveStatTotal(unit.effects, "rec") -
    statPenalty(unit.effects, "rec") +
    overdriveBonus(unit)
  );
}

/**
 * DEF `stat_mods` of a party unit: `buff.def` plus DEF passives, minus Weak/`debuff.def_down`,
 * plus the Overdrive Mode bonus.
 */
export function defStatMods(unit: BattleUnit): number {
  return (
    buffTotal(unit.effects, "buff.def") +
    passiveStatTotal(unit.effects, "def") -
    statPenalty(unit.effects, "def") +
    overdriveBonus(unit)
  );
}

/**
 * Applies one burst effect to a combatant. `ailment.inflict.*` first rolls its chance from the
 * battle RNG (one draw per living target) and takes the §2 ailment duration for `side`; a debuff
 * with a `chance` below 100 draws one integer in `[0, 99]` per living target and applies when the
 * draw is below it; a KO'd combatant cannot receive ailments or debuffs. Enemy skills apply their effects the same way
 * (source `bb`; `turn.ts`). `elementSets` holds the `side:slot:id` keys whose set this action
 * already started: a target's first `buff.add_element` (or `buff.add_ailment`) of the action clears
 * the slot's old set of that ID, and later ones join it (GAME_DESIGN §4 Kit additions (M2-04E,
 * M2-04G)).
 */
export function applyBurstEffect(
  m: { rng: RngState },
  target: { readonly effects: readonly ActiveEffect[]; readonly hp: number; readonly slot: string },
  effect: Effect | Omit<ActiveEffect, "source">,
  source: BurstSource,
  side: "party" | "enemy",
  elementSets: Set<string> = new Set(),
): ActiveEffect[] {
  if (isSetBuffId(effect.id) && effect.turns !== 0) {
    const key = `${side}:${target.slot}:${effect.id}`;
    const current = elementSets.has(key)
      ? target.effects
      : clearSlotEffects(target.effects, effect.id, source);
    elementSets.add(key);
    return applyEffect(current, effect, source);
  }
  const ailment = isInflictId(effect.id) || effect.id.startsWith("debuff.");
  if (ailment && (target.hp <= 0 || effect.turns === 0)) return [...target.effects];
  if (isInflictId(effect.id)) {
    const roll = rollInfliction(m.rng, { ...effect, id: effect.id }, side);
    m.rng = roll.rng;
    return roll.effect ? applyEffect(target.effects, roll.effect, source) : [...target.effects];
  }
  if (ailment && effect.chance !== undefined && effect.chance < 100) {
    const draw = nextInt(m.rng, 0, 99);
    m.rng = draw.rng;
    if (draw.value >= effect.chance) return [...target.effects];
  }
  return applyEffect(target.effects, effect, source);
}

function checkInputs(
  state: BattleState,
  inputs: readonly BattleInput[],
  untilTick: number | undefined,
): void {
  inputs.forEach((input, i) => {
    if (!Number.isSafeInteger(input.tick) || input.tick < state.tick) {
      throw new BattleInputError(
        `inputs[${i}].tick: must be an integer ≥ current tick ${state.tick} (got ${input.tick})`,
      );
    }
    if (untilTick !== undefined && input.tick > untilTick) {
      throw new BattleInputError(
        `inputs[${i}].tick: ${input.tick} is after untilTick ${untilTick}`,
      );
    }
    if (!state.party.some((u) => u.slot === input.actor)) {
      throw new BattleInputError(`inputs[${i}].actor: no party unit in slot "${input.actor}"`);
    }
    if (
      "target" in input &&
      input.target !== undefined &&
      !state.enemies.some((e) => e.slot === input.target)
    ) {
      throw new BattleInputError(`inputs[${i}].target: no enemy in slot "${input.target}"`);
    }
  });
}

/** Picks the selected target if alive, else the first living enemy in slot order. */
function resolveTarget(
  enemies: readonly BattleEnemy[],
  selected: EnemySlotId | undefined,
): EnemySlotId | undefined {
  const chosen = enemies.find((e) => e.slot === selected);
  if (chosen && chosen.hp > 0) {
    return chosen.slot;
  }
  return enemies.find((e) => e.hp > 0)?.slot;
}

interface DamageOptions {
  /** The attack's BB damage modifier plus `buff.bb_atk` (0 for normal attacks). */
  readonly bbModifier: number;
  /** The attack's flat ATK (`flatAtk` on its attack shape). */
  readonly flatAtk: number;
  /** Overdrive Mode at action start (a UBB ends it before damage is rolled). */
  readonly overdrive: boolean;
  /** Random-target hits cannot crit. */
  readonly canCrit: boolean;
  /** The attack's own crit-rate bonus in % points (`critRate` on its attack shape). */
  readonly critRate: number;
}

/**
 * Rolls and computes one attack's damage against one target at action start (GAME_DESIGN §3):
 * a DEF-ignore draw when the chance is partial, then crit, variance, and divisor draws from the
 * battle RNG. Active stat buffs are included in ATK, DEF, crit, and elemental terms; `extraCore`
 * repeats the computation without crit-damage and elemental-damage buffs for extra hits.
 */
function rollDamage(
  m: Mutable,
  unit: BattleUnit,
  target: BattleEnemy,
  options: DamageOptions,
): AttackDamage {
  const atkTotal = attackTotal({
    atk: unit.stats.atk,
    flatAtk: options.flatAtk,
    statMods:
      buffTotal(unit.effects, "buff.atk") +
      passiveStatTotal(unit.effects, "atk") +
      hpScaledAtkTotal(unit.effects, unit.hp, unit.stats.hp) -
      statPenalty(unit.effects, "atk") +
      (options.overdrive ? OVERDRIVE_STAT_BONUS : 0),
    bbModifier: options.bbModifier,
    converted: defConversionAtk(
      unit.effects,
      attackTotal({
        atk: unit.stats.def,
        statMods: defStatMods({ ...unit, overdrive: options.overdrive }),
      }),
    ),
  });
  const targetDef = attackTotal({
    atk: target.stats.def,
    statMods:
      buffTotal(target.effects, "buff.def") +
      passiveStatTotal(target.effects, "def") -
      statPenalty(target.effects, "def"),
  });
  const resist = elementalWeaknessResistance(target.effects);
  const element = {
    attacker: unit.element,
    defender: target.element,
    addedElements: addedElements(unit.effects),
    baseResistance: resist,
    buffedResistance: resist,
  };
  const ignore = rollDefIgnore(m.rng, defIgnoreChance(unit.effects));
  m.rng = ignore.rng;
  const critResist = critResistance(target.effects);
  const draw = rollAttack(
    m.rng,
    attackCritRate(buffTotal(unit.effects, "buff.crit_rate"), options.critRate, critResist),
    options.canCrit,
  );
  m.rng = draw.rng;
  const terms = { atkTotal, targetDef, defIgnore: ignore.value, rolls: draw.value, critResist };
  const outcome = elementOutcome({
    ...element,
    elementalDamageBuffs: buffTotal(unit.effects, "buff.elem_weak_dmg"),
  });
  return {
    core: attackCore({
      ...terms,
      critDamageBuffs: buffTotal(unit.effects, "buff.crit_dmg"),
      elementMult: outcome.mult,
    }),
    critical: draw.value.critical,
    extraCore: attackCore({ ...terms, elementMult: elementMultiplier(element) }),
    ...(outcome.relation ? { element: outcome.relation } : {}),
  };
}

/**
 * Schedules an action's hits (GAME_DESIGN §4 → Attack effects). Attacks resolve in order; a
 * single-target or AoE attack rolls its damage once per target (slot order), and a random-target
 * attack draws a living foe and then rolls its damage for each hit. Normal attacks add extra-hit
 * clones from active `hits.add_normal` effects.
 */
function scheduleAction(
  m: Mutable,
  unit: BattleUnit,
  attacks: readonly Attack[],
  plans: readonly AttackPlan[],
  origin: HitOrigin,
  selected: EnemySlotId,
  overdrive: boolean,
): ScheduledHit[] {
  const extras = plans === NORMAL_PLANS ? extraHitSources(unit.effects) : [];
  const hits: ScheduledHit[] = [];
  attacks.forEach((attack, attackIndex) => {
    const plan = plans[attackIndex] ?? NORMAL_ATTACK_PLAN;
    // BB ATK buffs add to a burst's modifier after HP scaling (BF Wiki *BB Atk Boost*).
    const bbAtk = plans === NORMAL_PLANS ? 0 : buffTotal(unit.effects, "buff.bb_atk");
    const options: DamageOptions = {
      bbModifier: bbModifier(plan, unit.hp, unit.stats.hp) + bbAtk,
      flatAtk: plan.flatAtk ?? 0,
      overdrive,
      canCrit: plan.area !== "random",
      critRate: plan.critRate ?? 0,
    };
    const attackTerms = plan.bcDrop ? { bcDrop: plan.bcDrop } : {};
    const foes = planTargets(plan, m.enemies, selected);
    if (plan.area === "random") {
      attack.hitFrames.forEach((_, hitIndex) => {
        const pick = pickRandomFoe(m.rng, foes);
        m.rng = pick.rng;
        if (!pick.value) return;
        const terms = rollDamage(m, unit, pick.value, options);
        const hit = scheduleHit(attack, attackIndex, hitIndex, origin, pick.value.slot, terms);
        hits.push({ ...hit, ...attackTerms, ailmentRoll: true });
      });
      return;
    }
    for (const foe of foes) {
      const terms = rollDamage(m, unit, foe, options);
      attack.hitFrames.forEach((_, hitIndex) => {
        const hit: ScheduledHit = {
          ...scheduleHit(attack, attackIndex, hitIndex, origin, foe.slot, terms),
          ...attackTerms,
          ...(hitIndex === 0 ? { ailmentRoll: true as const } : {}),
        };
        hits.push(hit, ...cloneExtraHits(hit, extras, terms.extraCore ?? terms.core));
      });
    }
  });
  return hits;
}

function reject(input: BattleInput, reason: ActionRejectedReason, events: BattleEvent[]): void {
  events.push({ type: "ActionRejected", tick: input.tick, actor: input.actor, reason });
}

/**
 * Swipe down: the unit guards for the turn, using its action. No base BB fill (RESOLVED-38 item 1);
 * active `bb.fill_on_guard` fills the gauge after `Guarded`.
 */
function startGuard(m: Mutable, input: GuardInput, events: BattleEvent[]): void {
  const index = m.party.findIndex((u) => u.slot === input.actor);
  const unit = m.party[index];
  if (!unit || unit.hp <= 0) {
    reject(input, "actor_dead", events);
    return;
  }
  if (m.acted.includes(unit.slot)) {
    reject(input, "already_acted", events);
    return;
  }
  if (isParalyzed(unit.effects)) {
    reject(input, "paralyzed", events);
    return;
  }
  const fill = bcFillOnGuard(unit.effects);
  const bc = fill > 0 ? fillGauge(unit, fill) : unit.bc;
  m.party[index] = { ...unit, guarding: true, bc };
  m.acted.push(unit.slot);
  events.push({ type: "Guarded", tick: input.tick, actor: unit.slot });
  if (bc !== unit.bc) {
    events.push({
      type: "GaugeFilled",
      tick: input.tick,
      actor: unit.slot,
      target: unit.slot,
      effect: "bb.fill_on_guard",
      gained: bc - unit.bc,
      gauge: bc,
    });
  }
}

/**
 * OD button: a living, UBB-capable unit not already in Overdrive Mode enters it when the squad OD
 * gauge is full. The gauge empties, its limit rises, and the unit keeps its BB gauge and action.
 */
function startOverdrive(m: Mutable, input: OverdriveInput, events: BattleEvent[]): void {
  const index = m.party.findIndex((u) => u.slot === input.actor);
  const unit = m.party[index];
  if (!unit || unit.hp <= 0) {
    reject(input, "actor_dead", events);
    return;
  }
  if (!unit.form.bursts.ubb) {
    reject(input, "not_ubb_capable", events);
    return;
  }
  if (unit.overdrive) {
    reject(input, "already_overdrive", events);
    return;
  }
  if (!isOdFull(m.od)) {
    reject(input, "od_not_full", events);
    return;
  }
  const limitBefore = m.od.limit;
  m.od = activateOd(m.od);
  m.party[index] = { ...unit, overdrive: true, overdriveTurns: OVERDRIVE_TURNS };
  events.push({
    type: "OverdriveActivated",
    tick: input.tick,
    actor: unit.slot,
    limitBefore,
    limitAfter: m.od.limit,
    turns: OVERDRIVE_TURNS,
  });
}

function startAction(m: Mutable, input: BattleInput, events: BattleEvent[], over: boolean): void {
  if (over) {
    reject(input, "battle_over", events);
  } else if (input.type === "guard") {
    startGuard(m, input, events);
  } else if (input.type === "overdrive") {
    startOverdrive(m, input, events);
  } else {
    startAttack(m, input, events);
  }
}

function startAttack(m: Mutable, input: AttackInput | BurstInput, events: BattleEvent[]): void {
  const unit = m.party.find((u) => u.slot === input.actor);
  const burst = unit && input.type === "burst" ? unit.form.bursts[input.tier] : undefined;
  const target = resolveTarget(m.enemies, input.target);
  let reason: ActionRejectedReason | undefined;
  if (!unit || unit.hp <= 0) {
    reason = "actor_dead";
  } else if (m.acted.includes(unit.slot)) {
    reason = "already_acted";
  } else if (isParalyzed(unit.effects)) {
    reason = "paralyzed";
  } else if (input.type === "burst" && !burst) {
    reason = "no_burst_tier";
  } else if (input.type === "burst" && isCursed(unit.effects)) {
    reason = "cursed";
  } else if (input.type === "burst" && input.tier === "ubb" && !unit.overdrive) {
    reason = "overdrive_required";
  } else if (
    input.type === "burst" &&
    !canBurst(
      unit.form,
      input.tier,
      unit.bc,
      unit.overdrive,
      gaugeModifiersFromEffects(unit.effects),
    )
  ) {
    reason = "insufficient_gauge";
  } else if (!target) {
    reason = "no_target";
  }
  if (reason || !unit || !target) {
    events.push({
      type: "ActionRejected",
      tick: input.tick,
      actor: input.actor,
      reason: reason ?? "no_target",
    });
    return;
  }
  const attacks = burst ? burst.attacks : [unit.form.normalAttack];
  const actionId = m.nextActionId;
  const targetEnemy = m.enemies.find((e) => e.slot === target);
  if (!targetEnemy) {
    return;
  }
  let used: BurstUsedEvent | undefined;
  const applied: (EffectAppliedEvent | EffectEndedEvent | HealedEvent | GaugeFilledEvent)[] = [];
  const odGains: number[] = [];
  if (input.type === "burst") {
    // The refund share is the burst's first draw: ranged reductions roll before any effect.
    const refund = rollConsumptionReduction(unit.effects, m.rng);
    m.rng = refund.rng;
    const gaugeAfter = gaugeAfterBurst(unit.form, input.tier, {
      ...gaugeModifiersFromEffects(unit.effects),
      consumptionReduction: refund.value,
    });
    const index = m.party.findIndex((member) => member.slot === unit.slot);
    m.party[index] = {
      ...unit,
      bc: gaugeAfter,
      ...(input.tier === "ubb" ? { overdrive: false, overdriveTurns: 0 } : {}),
    };
    const elementSets = new Set<string>();
    for (const effect of burst?.effects ?? []) {
      if (effect.id === "od.fill_instant") {
        // The OD gauge is squad-wide: one fill per effect, whatever its target.
        if (effect.turns !== 0) {
          const before = m.od.points;
          m.od = instantOdFill(m.od, effect.value);
          odGains.push(m.od.points - before);
        }
        continue;
      }
      const applyToParty =
        effect.target === "party" || effect.target === "self" || effect.target === "ally";
      if (applyToParty) {
        const healer = m.party.find((member) => member.slot === unit.slot) ?? unit;
        const healerRec = (): number =>
          attackTotal({ atk: healer.stats.rec, statMods: recStatMods(healer) });
        m.party = m.party.map((member) => {
          const selected =
            (effect.target === "party" ||
              (effect.target === "self" && member.slot === unit.slot) ||
              (effect.target === "ally" && member.slot === "ally")) &&
            (effect.element === undefined || effect.element === member.element);
          if (!selected) return member;
          // A HoT's healer REC bonus uses the healer's total REC when the burst applies it.
          const stored =
            effect.id === "heal.over_time" && effect.recBonus !== undefined
              ? { ...effect, healerRec: healerRec() }
              : effect;
          const effects = applyBurstEffect(m, member, stored, input.tier, "party", elementSets);
          if (effect.id === "heal.instant" && effect.turns !== 0 && member.hp > 0) {
            const roll = burstHealAmount(
              effect,
              attackTotal({
                atk: member.stats.rec,
                statMods: recStatMods(member),
              }),
              healerRec(),
              m.rng,
            );
            m.rng = roll.rng;
            const hp = Math.min(member.stats.hp, member.hp + roll.value);
            applied.push({
              type: "Healed",
              tick: input.tick,
              actionId,
              actor: unit.slot,
              target: member.slot,
              amount: hp - member.hp,
              hp,
            });
            return { ...member, effects, hp };
          }
          if (effect.id === "bb.fill_instant" && effect.turns !== 0 && member.hp > 0) {
            const bc = fillGauge(member, effect.value);
            applied.push({
              type: "GaugeFilled",
              tick: input.tick,
              actionId,
              actor: unit.slot,
              target: member.slot,
              effect: "bb.fill_instant",
              gained: bc - member.bc,
              gauge: bc,
            });
            return { ...member, effects, bc };
          }
          if (
            effects.length !== member.effects.length ||
            effects.some((item, i) => item !== member.effects[i])
          ) {
            applied.push({
              type: "EffectApplied",
              tick: input.tick,
              actionId,
              actor: unit.slot,
              target: member.slot,
              effect,
            });
            for (const id of endedEffectIds(member.effects, effects)) {
              applied.push({
                type: "EffectEnded",
                tick: input.tick,
                target: member.slot,
                effect: id,
              });
            }
          }
          return { ...member, effects };
        });
      } else {
        m.enemies = m.enemies.map((enemy) => {
          const selected = effect.target === "enemies" || enemy.slot === target;
          if (!selected) return enemy;
          // A DoT keeps the inflicter's unbuffed ATK and element (BF Wiki *DoT*; RESOLVED-49).
          const stored =
            effect.id === "debuff.dot"
              ? { ...effect, dotAtk: unit.stats.atk, dotElement: unit.element }
              : effect;
          const effects = applyBurstEffect(m, enemy, stored, input.tier, "enemy", elementSets);
          if (
            effects.length !== enemy.effects.length ||
            effects.some((item, i) => item !== enemy.effects[i])
          ) {
            applied.push({
              type: "EffectApplied",
              tick: input.tick,
              actionId,
              actor: unit.slot,
              target: enemy.slot,
              effect,
            });
            for (const id of endedEffectIds(enemy.effects, effects)) {
              applied.push({
                type: "EffectEnded",
                tick: input.tick,
                target: enemy.slot,
                effect: id,
              });
            }
          }
          return { ...enemy, effects };
        });
      }
    }
    used = {
      type: "BurstUsed",
      tick: input.tick,
      actionId,
      actor: unit.slot,
      tier: input.tier,
      gaugeBefore: unit.bc,
      gaugeAfter,
    };
  }
  const activeUnit = m.party.find((member) => member.slot === unit.slot) ?? unit;
  const activeTarget = m.enemies.find((enemy) => enemy.slot === target) ?? targetEnemy;
  const hits = scheduleAction(
    m,
    activeUnit,
    attacks,
    burst ? attackPlans(burst) : NORMAL_PLANS,
    { startTick: input.tick, actionId, actor: unit.slot },
    target,
    unit.overdrive,
  );
  m.nextActionId += 1;
  m.acted.push(unit.slot);
  m.timeline = insertHits(m.timeline, hits);
  events.push({
    type: "ActionStarted",
    tick: input.tick,
    actionId,
    actor: unit.slot,
    action: input.type,
    ...(input.type === "burst" ? { tier: input.tier } : {}),
    target,
    hits: hits.length,
  });
  if (used) events.push(used);
  events.push(...applied);
  const weakAttacks = isStrongAgainst(unit.element, activeTarget.element) ? attacks.length : 0;
  const before = m.od.points - odGains.reduce((sum, gained) => sum + gained, 0);
  m.od = addOd(
    m.od,
    actionOdYield(
      input.type === "burst" ? input.tier : "attack",
      weakAttacks,
      odFillRate(activeUnit.effects),
    ),
  );
  if (m.od.points > before) {
    events.push({
      type: "OdGained",
      tick: input.tick,
      actionId,
      actor: unit.slot,
      gained: m.od.points - before,
      points: m.od.points,
      limit: m.od.limit,
    });
  }
}

function resolveHit(m: Mutable, hit: ScheduledHit, sparked: boolean, events: BattleEvent[]): void {
  const index = m.enemies.findIndex((e) => e.slot === hit.target);
  const enemy = m.enemies[index];
  if (!enemy) {
    return;
  }
  const attacker = m.party.find((unit) => unit.slot === hit.actor);
  // Extra hits cannot use spark-damage buffs (BF Wiki *Damage* → Extra Hits), and get no spark
  // critical, spark vulnerability, or BC fill on spark either (RESOLVED-42).
  const sparkEffects = sparked && !hit.extra;
  let sparkBuffs = 0;
  let sparkCritical = false;
  if (attacker && sparkEffects) {
    const crit = rollSparkCritical(attacker.effects, m.rng);
    m.rng = crit.rng;
    sparkCritical = crit.value > 0;
    sparkBuffs =
      buffTotal(attacker.effects, "buff.spark_dmg") +
      sparkVulnerability(enemy.effects) +
      crit.value;
  }
  const damage = hitDamage(hit.core, hit.distribution, {
    sparkMult: sparkMultiplier(sparked, sparkBuffs),
  });
  const hp = Math.max(0, enemy.hp - damage);
  m.enemies[index] = { ...enemy, hp };
  const landed: HitLandedEvent = {
    type: "HitLanded",
    tick: hit.tick,
    actionId: hit.actionId,
    actor: hit.actor,
    target: hit.target,
    attackIndex: hit.attackIndex,
    hitIndex: hit.hitIndex,
    ...(hit.extra ? { extraIndex: hit.extra.index } : {}),
    critical: hit.critical,
    sparked,
    ...(sparkCritical ? { sparkCritical: true as const } : {}),
    ...(hit.element ? { element: hit.element } : {}),
    damage,
    targetHp: hp,
  };
  events.push(landed);
  if (!hit.extra || hit.extra.drops) dropCrystals(m, hit, enemy, sparked, events);
  if (sparkEffects) fillOnSpark(m, hit, events);
  afterDamageDealt(m, hit, damage, events);
  if (hit.ailmentRoll && !hit.extra) inflictAddedAilments(m, hit, events);
  if (enemy.hp > 0 && hp === 0) {
    const defeated: EnemyDefeatedEvent = {
      type: "EnemyDefeated",
      tick: hit.tick,
      target: hit.target,
    };
    events.push(defeated);
  }
}

/**
 * After a party hit lands (its drops and BC fill on spark done; GAME_DESIGN §4 Kit additions
 * (M2-04F)): the attacker's `hp_drain` effects draw their procs and ranges and heal a share of the
 * hit's damage, then its damage-dealt tally grows by the damage and each `bb.fill_on_damage_dealt`
 * whose threshold the tally crosses fills its BC (effect fill; a KO'd or cursed unit gains nothing).
 */
function afterDamageDealt(
  m: Mutable,
  hit: ScheduledHit,
  damage: number,
  events: BattleEvent[],
): void {
  const index = m.party.findIndex((u) => u.slot === hit.actor);
  let unit = m.party[index];
  if (!unit) return;
  const drain = hpDrainAmount(unit.effects, damage, m.rng);
  m.rng = drain.rng;
  const hp = unit.hp > 0 ? Math.min(unit.stats.hp, unit.hp + drain.value) : unit.hp;
  if (hp > unit.hp) {
    events.push({
      type: "HpRestored",
      tick: hit.tick,
      actionId: hit.actionId,
      target: unit.slot,
      effect: "hp_drain",
      amount: hp - unit.hp,
      hp,
    });
    unit = { ...unit, hp };
  }
  const before = unit.damageDealt;
  unit = { ...unit, damageDealt: before + damage };
  const fill = bcFillOnDamageDealt(unit.effects, before, unit.damageDealt);
  const bc = fill > 0 ? fillGauge(unit, fill) : unit.bc;
  if (bc !== unit.bc) {
    events.push({
      type: "GaugeFilled",
      tick: hit.tick,
      actionId: hit.actionId,
      actor: unit.slot,
      target: unit.slot,
      effect: "bb.fill_on_damage_dealt",
      gained: bc - unit.bc,
      gauge: bc,
    });
    unit = { ...unit, bc };
  }
  m.party[index] = unit;
}

/**
 * *Status Infliction Added to Attack* (GAME_DESIGN §4 Kit additions (M2-04G)), after the hit's
 * drops, BC fill on spark, and HP drain: on the hit marked `ailmentRoll`, each ailment the
 * attacker's active `buff.add_ailment` effects add draws one `[0, 99]` integer (`AILMENTS` order)
 * and lands below its summed chance with the enemy rule duration. A foe the hit KO'd draws nothing.
 */
function inflictAddedAilments(m: Mutable, hit: ScheduledHit, events: BattleEvent[]): void {
  const attacker = m.party.find((u) => u.slot === hit.actor);
  const index = m.enemies.findIndex((e) => e.slot === hit.target);
  const enemy = m.enemies[index];
  if (!attacker || !enemy || enemy.hp <= 0) return;
  const roll = rollAddedAilments(m.rng, attacker.effects, "enemy");
  m.rng = roll.rng;
  let effects = enemy.effects;
  for (const effect of roll.value) {
    const next = applyEffect(effects, effect, "bb");
    if (next.length !== effects.length || next.some((item, i) => item !== effects[i])) {
      events.push({
        type: "EffectApplied",
        tick: hit.tick,
        actionId: hit.actionId,
        actor: hit.actor,
        target: hit.target,
        effect,
      });
    }
    effects = next;
  }
  m.enemies[index] = { ...enemy, effects };
}

/**
 * *BC Fill on Spark* for a sparked hit, after its drops: the attacker's `bb.fill_on_spark`
 * effects draw their ranges (`rollBcFillOnSpark`) and fill its gauge as an effect fill (not
 * boosted by BC efficacy; a KO'd or cursed unit gains nothing, but the draws still happen).
 */
function fillOnSpark(m: Mutable, hit: ScheduledHit, events: BattleEvent[]): void {
  const index = m.party.findIndex((u) => u.slot === hit.actor);
  const unit = m.party[index];
  if (!unit) return;
  const fill = rollBcFillOnSpark(unit.effects, m.rng);
  m.rng = fill.rng;
  if (fill.value <= 0) return;
  const bc = fillGauge(unit, fill.value);
  if (bc === unit.bc) return;
  m.party[index] = { ...unit, bc };
  events.push({
    type: "GaugeFilled",
    tick: hit.tick,
    actionId: hit.actionId,
    actor: unit.slot,
    target: unit.slot,
    effect: "bb.fill_on_spark",
    gained: bc - unit.bc,
    gauge: bc,
  });
}

/**
 * Rolls a landed hit's crystal drops and credits them to the attacker (GAME_DESIGN §2 Brave
 * Crystals). Overkill (×2) applies when the target was already at 0 HP before this hit. The
 * attacker's `drop.bc`/`drop.hc` buffs raise the rates and its BC/HC efficacy scales collection;
 * spark drop bonuses and buffed resistances remain pending (M1-06E).
 */
function dropCrystals(
  m: Mutable,
  hit: ScheduledHit,
  enemyBefore: BattleEnemy,
  sparked: boolean,
  events: BattleEvent[],
): void {
  const overkill = enemyBefore.hp <= 0;
  const spark = sparkDropBonus(sparked, 0);
  const attackerEffects = m.party.find((u) => u.slot === hit.actor)?.effects ?? [];
  const draw = rollHitDrops(m.rng, {
    checks: hit.dropChecks,
    bcRate: bcDropRate({
      ...bcDropBonusesFromEffects(attackerEffects),
      inherent: hit.bcDrop ?? 0,
      baseResistance: enemyBefore.bcResistance ?? 0,
      spark,
      overkill,
    }),
    hcRate: hcDropRate({ bonus: hcDropBonusFromEffects(attackerEffects), spark, overkill }),
  });
  m.rng = draw.rng;
  const drops = draw.value;
  if (drops.bc === 0 && drops.hc === 0) {
    return;
  }
  const index = m.party.findIndex((u) => u.slot === hit.actor);
  const unit = m.party[index];
  if (!unit) {
    return;
  }
  const collected = collectCrystals(
    {
      form: unit.form,
      maxHp: unit.stats.hp,
      hp: unit.hp,
      bc: unit.bc,
      overdrive: unit.overdrive,
      recTotal: attackTotal({
        atk: unit.stats.rec,
        statMods: recStatMods(unit),
      }),
    },
    drops,
    collectModifiersFromEffects(unit.effects),
  );
  // Curse stops the BB gauge from filling; HC healing still applies.
  const cursed = isCursed(unit.effects);
  const bc = cursed ? unit.bc : collected.bc;
  m.party[index] = { ...unit, bc, hp: collected.hp };
  const event: CrystalDroppedEvent = {
    type: "CrystalDropped",
    tick: hit.tick,
    actionId: hit.actionId,
    collector: hit.actor,
    target: hit.target,
    attackIndex: hit.attackIndex,
    hitIndex: hit.hitIndex,
    bc: drops.bc,
    hc: drops.hc,
    bcGained: cursed ? 0 : collected.bcGained,
    healed: collected.healed,
    gauge: bc,
    hp: collected.hp,
  };
  events.push(event);
}

/**
 * Resolves every hit due this tick: detects sparks across the whole batch first (a spark needs
 * two hits on one target in the window), emits one `Sparked` event per sparking target, then
 * resolves the hits in timeline order. Per sparked hit the RNG order is: spark-critical draws,
 * then the crystal drop draws, then BC-fill-on-spark range draws (GAME_DESIGN §4 M2-04D).
 */
function resolveTick(m: Mutable, now: number, events: BattleEvent[]): void {
  let count = 0;
  while (m.timeline[count]?.tick === now) {
    count += 1;
  }
  const batch = m.timeline.splice(0, count);
  const sparked = detectSparks(batch);
  const groups = new Map<ScheduledHit["target"], SparkedEvent["actors"][number][]>();
  batch.forEach((hit, i) => {
    if (sparked[i] && !hit.extra) {
      const actors = groups.get(hit.target) ?? [];
      actors.push(hit.actor);
      groups.set(hit.target, actors);
    }
  });
  for (const [target, actors] of groups) {
    events.push({ type: "Sparked", tick: now, target, hits: actors.length, actors });
  }
  batch.forEach((hit, i) => {
    resolveHit(m, hit, sparked[i] ?? false, events);
  });
}

/**
 * Advances the battle (GAME_DESIGN §2 Timing model). Inputs are sorted by tick (stable, so
 * same-tick inputs keep their given order). At each tick, inputs start their actions first — hits
 * land at `tick + startDelayFrames + hitFrames[i]` — then every hit due that tick resolves in
 * timeline order, with sparks detected across that tick's hits; each hit then rolls its crystal
 * drops, which the attacker collects. Returns the new state and the ordered event log; `state` is never mutated.
 */
export function step(
  state: BattleState,
  inputs: readonly BattleInput[],
  options: StepOptions = {},
): StepResult {
  const { untilTick } = options;
  if (untilTick !== undefined && (!Number.isSafeInteger(untilTick) || untilTick < state.tick)) {
    throw new BattleInputError(
      `untilTick: must be an integer ≥ current tick ${state.tick} (got ${untilTick})`,
    );
  }
  checkInputs(state, inputs, untilTick);

  const pending = inputs
    .map((input, order) => ({ input, order }))
    .sort((a, b) => a.input.tick - b.input.tick || a.order - b.order)
    .map(({ input }) => input);
  const m: Mutable = {
    rng: state.rng,
    party: [...state.party],
    enemies: [...state.enemies],
    timeline: [...state.timeline],
    nextActionId: state.nextActionId,
    od: state.od,
    acted: [...state.acted],
  };
  const events: BattleEvent[] = [];
  let tick = state.tick;
  let inputIndex = 0;

  for (;;) {
    const nextInput = pending[inputIndex]?.tick;
    const nextHit = m.timeline[0]?.tick;
    if (nextInput === undefined && nextHit === undefined) {
      break;
    }
    const now = Math.min(
      nextInput ?? Number.POSITIVE_INFINITY,
      nextHit ?? Number.POSITIVE_INFINITY,
    );
    if (untilTick !== undefined && now > untilTick) {
      break;
    }
    tick = now;
    for (let input = pending[inputIndex]; input?.tick === now; input = pending[inputIndex]) {
      startAction(m, input, events, state.result !== undefined);
      inputIndex += 1;
    }
    resolveTick(m, now, events);
  }

  return {
    state: {
      ...state,
      rng: m.rng,
      tick: untilTick ?? tick,
      party: m.party,
      enemies: m.enemies,
      timeline: m.timeline,
      nextActionId: m.nextActionId,
      od: m.od,
      acted: m.acted,
    },
    events,
  };
}
