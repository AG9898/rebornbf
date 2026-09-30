import type { Attack, EnemySkill } from "@bfr/data";
import { evaluateEnemyAi } from "./ai/evaluate.ts";
import {
  dotDamage,
  isParalyzed,
  poisonDamage,
  rollInfliction,
  statPenalty,
} from "./effects/ailments.ts";
import {
  type AttackPlan,
  attackCritRate,
  attackPlans,
  bbModifier,
  NORMAL_ATTACK_PLAN,
  pickRandomFoe,
} from "./effects/attack.ts";
import { type ActiveEffect, addedElements, buffTotal, defConversionAtk } from "./effects/buffs.ts";
import {
  bcFillOnDamageTaken,
  bcFillPerTurn,
  fillGauge,
  odFillRate,
  rollBcFillWhenAttacked,
} from "./effects/gauge.ts";
import { EFFECT_REGISTRY, endedEffectIds, tickEffects } from "./effects/index.ts";
import { passiveStatTotal, refreshPassives } from "./effects/passive.ts";
import {
  absorbWithBarrier,
  activeBarrier,
  burstHealAmount,
  critResistance,
  damageToHealAmount,
  elementalWeaknessResistance,
  guardBonus,
  healOverTimeAmount,
  mitigationFromEffects,
  rollChanceMitigation,
  rollDamageReflect,
  takeDamage,
  takeUnitDamage,
  triggeredMitigation,
  triggerMitigation,
} from "./effects/survival.ts";
import type { BattleEvent } from "./events.ts";
import { attackTotal } from "./formulas/attack-stat.ts";
import { attackCore, hitDamage, rollAttack } from "./formulas/damage.ts";
import { type ElementRelation, elementMultiplier, elementOutcome } from "./formulas/element.ts";
import { guardMultiplier, mitigationMultiplier } from "./formulas/mitigation.ts";
import { addOd, endOverdriveTurn, type OdGauge, turnEndOdYield } from "./gauge/overdrive.ts";
import type { RngState } from "./rng.ts";
import { spawnWave } from "./state/create-battle.ts";
import type {
  BattleEnemy,
  BattleResult,
  BattleState,
  BattleUnit,
  EnemySlotId,
  PlayerSlotId,
} from "./state/types.ts";
import {
  applyBurstEffect,
  BattleInputError,
  defStatMods,
  recStatMods,
  type StepResult,
  step,
} from "./step.ts";
import type { BattleInput } from "./timeline/types.ts";

interface TurnMutable {
  rng: RngState;
  party: BattleUnit[];
  enemies: BattleEnemy[];
  od: OdGauge;
}

/** One enemy hit, planned at action start with its damage terms fixed (like player hits). */
interface EnemyHit {
  readonly tick: number;
  readonly attackIndex: number;
  readonly hitIndex: number;
  readonly target: PlayerSlotId;
  readonly core: number;
  readonly critical: boolean;
  /** The attack's elemental relation to the unit's own element; absent when neutral. */
  readonly element?: ElementRelation;
  /** The per-attack core against the unit's barrier (its element, 0 DEF), if it had one. */
  readonly barrierCore?: number;
  /** Passive mitigation from `chance_mitigation` procs rolled for this attack. */
  readonly chanceMitigation: number;
  readonly distribution: number;
  /** Hits sharing a key form one "attack" for `damage_to_heal` and `bb.fill_on_hit`. */
  readonly attackKey: string;
}

function allDefeated(combatants: readonly { readonly hp: number }[]): boolean {
  return combatants.every((c) => c.hp <= 0);
}

type EnemyDamageTerms = Pick<
  EnemyHit,
  "core" | "critical" | "element" | "barrierCore" | "chanceMitigation"
>;

/**
 * An enemy attack's per-attack damage against one party unit (GAME_DESIGN §3), drawing crit,
 * crit base or variance, and divisor from the battle RNG, then one proc draw per active
 * `chance_mitigation` below 100% (stored order). The enemy's ATK uses its `buff.atk`,
 * Injury/`debuff.atk_down`, and `buff.atk_from_def`; the unit's DEF uses buffs, DEF passives,
 * Weak/`debuff.def_down`, and the Overdrive Mode +100%. The unit's `crit_resist` scales the crit
 * rate and bonus. A unit with a barrier also gets the core against the barrier (0 DEF, the
 * barrier's element; neutral when it has none).
 */
function rollEnemyDamage(
  m: TurnMutable,
  enemy: BattleEnemy,
  unit: BattleUnit,
  plan: AttackPlan,
): EnemyDamageTerms {
  const atkTotal = attackTotal({
    atk: enemy.stats.atk,
    flatAtk: plan.flatAtk ?? 0,
    statMods: buffTotal(enemy.effects, "buff.atk") - statPenalty(enemy.effects, "atk"),
    bbModifier: bbModifier(plan, enemy.hp, enemy.stats.hp),
    converted: defConversionAtk(
      enemy.effects,
      attackTotal({
        atk: enemy.stats.def,
        statMods: buffTotal(enemy.effects, "buff.def") - statPenalty(enemy.effects, "def"),
      }),
    ),
  });
  const targetDef = attackTotal({ atk: unit.stats.def, statMods: defStatMods(unit) });
  const critResist = critResistance(unit.effects);
  const draw = rollAttack(
    m.rng,
    attackCritRate(buffTotal(enemy.effects, "buff.crit_rate"), plan.critRate ?? 0, critResist),
    plan.area !== "random",
  );
  m.rng = draw.rng;
  const elementTerms = {
    attacker: enemy.element,
    addedElements: addedElements(enemy.effects),
    elementalDamageBuffs: buffTotal(enemy.effects, "buff.elem_weak_dmg"),
  };
  const terms = {
    atkTotal,
    rolls: draw.value,
    critDamageBuffs: buffTotal(enemy.effects, "buff.crit_dmg"),
    critResist,
  };
  const resist = elementalWeaknessResistance(unit.effects);
  const outcome = elementOutcome({
    ...elementTerms,
    defender: unit.element,
    baseResistance: resist,
    buffedResistance: resist,
  });
  const core = attackCore({ ...terms, targetDef, elementMult: outcome.mult });
  const barrier = activeBarrier(unit.effects);
  const barrierCore = barrier
    ? attackCore({
        ...terms,
        targetDef: 0,
        elementMult:
          barrier.element === undefined
            ? 1
            : elementMultiplier({ ...elementTerms, defender: barrier.element }),
      })
    : undefined;
  const chance = rollChanceMitigation(unit.effects, m.rng);
  m.rng = chance.rng;
  return {
    core,
    critical: draw.value.critical,
    ...(outcome.relation ? { element: outcome.relation } : {}),
    ...(barrierCore === undefined ? {} : { barrierCore }),
    chanceMitigation: chance.value,
  };
}

/**
 * Plans an enemy action's hits at action start: a single-target attack hits the AI's target, an
 * AoE attack every living unit (party order), a random attack draws a living unit per hit; damage
 * is rolled per target (per hit for random). Hits land at `start + startDelayFrames + hitFrames[i]`.
 */
function planEnemyHits(
  m: TurnMutable,
  enemy: BattleEnemy,
  attacks: readonly Attack[],
  plans: readonly AttackPlan[],
  target: PlayerSlotId | undefined,
  start: number,
): EnemyHit[] {
  const hits: EnemyHit[] = [];
  attacks.forEach((attack, attackIndex) => {
    const plan = plans[attackIndex] ?? NORMAL_ATTACK_PLAN;
    const foes = m.party.filter(
      (unit) =>
        unit.hp > 0 &&
        (plan.area !== "single" || unit.slot === target) &&
        (plan.element === undefined || unit.element === plan.element),
    );
    const hitAt = (i: number): number =>
      start + attack.startDelayFrames + (attack.hitFrames[i] ?? 0);
    if (plan.area === "random") {
      attack.hitFrames.forEach((_, hitIndex) => {
        const pick = pickRandomFoe(m.rng, foes);
        m.rng = pick.rng;
        if (!pick.value) return;
        const terms = rollEnemyDamage(m, enemy, pick.value, plan);
        hits.push({
          tick: hitAt(hitIndex),
          attackIndex,
          hitIndex,
          target: pick.value.slot,
          ...terms,
          distribution: attack.damageDistribution[hitIndex] ?? 0,
          attackKey: `${attackIndex}:${hitIndex}`,
        });
      });
      return;
    }
    for (const foe of foes) {
      const terms = rollEnemyDamage(m, enemy, foe, plan);
      attack.hitFrames.forEach((_, hitIndex) => {
        hits.push({
          tick: hitAt(hitIndex),
          attackIndex,
          hitIndex,
          target: foe.slot,
          ...terms,
          distribution: attack.damageDistribution[hitIndex] ?? 0,
          attackKey: `${attackIndex}:${foe.slot}`,
        });
      });
    }
  });
  // Stable: same-tick hits keep attack, target (party order), then hit order.
  return hits.sort((a, b) => a.tick - b.tick);
}

/**
 * After an enemy attack's last hit on a unit it cost HP and left alive: `damage_to_heal` heals a
 * share of the damage taken, `bb.fill_on_hit` fills the gauge (a ranged fill draws its BC), then
 * `damage_reflect` may damage the attacking enemy, then SP ailments counter via existing
 * infliction handlers (GAME_DESIGN §4; RESOLVED-77).
 */
function afterEnemyAttack(
  m: TurnMutable,
  attacker: EnemySlotId,
  slot: PlayerSlotId,
  damage: number,
  tick: number,
  events: BattleEvent[],
): void {
  const index = m.party.findIndex((unit) => unit.slot === slot);
  let unit = m.party[index];
  if (!unit || unit.hp <= 0 || damage <= 0) return;
  const heal = damageToHealAmount(unit.effects, damage, m.rng);
  m.rng = heal.rng;
  const hp = Math.min(unit.stats.hp, unit.hp + heal.value);
  if (hp > unit.hp) {
    events.push({
      type: "HpRestored",
      tick,
      target: slot,
      effect: "damage_to_heal",
      amount: hp - unit.hp,
      hp,
    });
    unit = { ...unit, hp };
  }
  const fillRoll = rollBcFillWhenAttacked(unit.effects, m.rng);
  m.rng = fillRoll.rng;
  const fill = fillRoll.value;
  const bc = fill > 0 ? fillGauge(unit, fill) : unit.bc;
  if (bc !== unit.bc) {
    events.push({
      type: "GaugeFilled",
      tick,
      actor: slot,
      target: slot,
      effect: "bb.fill_on_hit",
      gained: bc - unit.bc,
      gauge: bc,
    });
    unit = { ...unit, bc };
  }
  m.party[index] = unit;
  const e = m.enemies.findIndex((enemy) => enemy.slot === attacker);
  const enemy = m.enemies[e];
  if (!enemy || enemy.hp <= 0) return;
  const counter = rollDamageReflect(unit.effects, damage, enemy.hp, m.rng);
  m.rng = counter.rng;
  if (counter.value > 0) {
    const enemyHp = enemy.hp - counter.value;
    m.enemies[e] = { ...enemy, hp: enemyHp };
    events.push({
      type: "CounterDamaged",
      tick,
      actor: slot,
      target: attacker,
      effect: "damage_reflect",
      damage: counter.value,
      hp: enemyHp,
    });
  }
  // RESOLVED-77: after reflect, only a living attacker receives counters. No damage path
  // is called here, so reflected/turn damage and counters cannot recursively trigger them.
  for (const { ailment, chance } of unit.enhancementAilmentCounters ?? []) {
    const target = m.enemies[e];
    if (!target || target.hp <= 0) break;
    const roll = rollInfliction(
      m.rng,
      {
        id: `ailment.inflict.${ailment}`,
        value: chance,
        target: "enemy",
      },
      "enemy",
    );
    m.rng = roll.rng;
    if (!roll.effect) continue;
    const effects = EFFECT_REGISTRY[roll.effect.id](target.effects, {
      ...roll.effect,
      source: "triggered",
    });
    if (changed(target.effects, effects)) {
      events.push({
        type: "AilmentCounterApplied",
        tick,
        actor: slot,
        target: attacker,
        effect: roll.effect,
      });
    }
    m.enemies[e] = { ...target, effects };
  }
}

/**
 * After a hit dealt `damage` HP damage to a living unit: the damage-taken tally grows, and each
 * threshold it crosses fires `bb.fill_on_damage_taken` (BC, stacking) and
 * `mitigation_after_damage` (a triggered passive `mitigation`; GAME_DESIGN §4 Kit additions
 * (M2-04C)).
 */
function afterDamageTaken(
  m: TurnMutable,
  index: number,
  damage: number,
  tick: number,
  events: BattleEvent[],
): void {
  let unit = m.party[index];
  if (!unit) return;
  const before = unit.damageTaken;
  const after = before + damage;
  unit = { ...unit, damageTaken: after };
  if (unit.hp > 0 && damage > 0) {
    const fill = bcFillOnDamageTaken(unit.effects, before, after);
    const bc = fill > 0 ? fillGauge(unit, fill) : unit.bc;
    if (bc !== unit.bc) {
      events.push({
        type: "GaugeFilled",
        tick,
        actor: unit.slot,
        target: unit.slot,
        effect: "bb.fill_on_damage_taken",
        gained: bc - unit.bc,
        gauge: bc,
      });
      unit = { ...unit, bc };
    }
    const mitigation = triggeredMitigation(unit.effects, before, after);
    if (mitigation) {
      events.push({
        type: "EffectTriggered",
        tick,
        target: unit.slot,
        effect: "mitigation_after_damage",
        value: mitigation.value,
        turns: mitigation.turns ?? 1,
      });
      unit = { ...unit, effects: triggerMitigation(unit.effects, mitigation) };
    }
  }
  m.party[index] = unit;
}

/** Lands planned enemy hits in order; returns the tick of the last hit (or `start`). */
function resolveEnemyHits(
  m: TurnMutable,
  enemy: BattleEnemy,
  hits: readonly EnemyHit[],
  start: number,
  events: BattleEvent[],
): number {
  const remaining = new Map<string, number>();
  const dealt = new Map<string, number>();
  for (const hit of hits) remaining.set(hit.attackKey, (remaining.get(hit.attackKey) ?? 0) + 1);
  let tick = start;
  for (const hit of hits) {
    tick = hit.tick;
    const index = m.party.findIndex((unit) => unit.slot === hit.target);
    const unit = m.party[index];
    // Hits on a unit that has already fallen are skipped (no event, no RNG).
    if (unit && unit.hp > 0) {
      const mods = {
        mitigation: mitigationMultiplier(
          mitigationFromEffects(unit.effects, { chanceMitigation: hit.chanceMitigation }),
        ),
        guard: guardMultiplier(unit.guarding, guardBonus(unit.effects)),
      };
      const unitHit = hitDamage(hit.core, hit.distribution, mods);
      const shielded = activeBarrier(unit.effects) !== undefined;
      const absorb = absorbWithBarrier(
        unit.effects,
        unitHit,
        shielded ? hitDamage(hit.barrierCore ?? hit.core, hit.distribution, mods) : unitHit,
      );
      const damage = absorb.damage;
      const ko = takeUnitDamage(unit, absorb.effects, damage, m.rng);
      m.rng = ko.rng;
      m.party[index] = {
        ...unit,
        hp: ko.hp,
        effects: ko.effects,
        ...("passiveAngelIdol" in ko ? { passiveAngelIdol: ko.passiveAngelIdol } : {}),
      };
      dealt.set(hit.attackKey, (dealt.get(hit.attackKey) ?? 0) + (unit.hp - ko.hp));
      events.push({
        type: "EnemyHitLanded",
        tick: hit.tick,
        actor: enemy.slot,
        target: hit.target,
        attackIndex: hit.attackIndex,
        hitIndex: hit.hitIndex,
        critical: hit.critical,
        ...(hit.element ? { element: hit.element } : {}),
        damage,
        unitHp: ko.hp,
        ...(ko.survived ? { survived: true as const } : {}),
        ...(shielded ? { absorbed: absorb.absorbed, barrierHp: absorb.barrierHp } : {}),
      });
      pushEnded(events, hit.tick, hit.target, unit.effects, ko.effects);
      if (ko.hp === 0) events.push({ type: "UnitDefeated", tick: hit.tick, target: hit.target });
      afterDamageTaken(m, index, damage, hit.tick, events);
    }
    const left = (remaining.get(hit.attackKey) ?? 1) - 1;
    remaining.set(hit.attackKey, left);
    if (left === 0) {
      afterEnemyAttack(m, enemy.slot, hit.target, dealt.get(hit.attackKey) ?? 0, tick, events);
    }
  }
  return tick;
}

/** True when `after` differs from `before` (an effect was stored, replaced, or removed). */
/** One `EffectEnded` per effect ID that left `slot` between `before` and `after`. */
function pushEnded(
  events: BattleEvent[],
  tick: number,
  target: PlayerSlotId | EnemySlotId,
  before: readonly ActiveEffect[],
  after: readonly ActiveEffect[],
): void {
  for (const effect of endedEffectIds(before, after)) {
    events.push({ type: "EffectEnded", tick, target, effect });
  }
}

function changed(before: readonly ActiveEffect[], after: readonly ActiveEffect[]): boolean {
  return after.length !== before.length || after.some((effect, i) => effect !== before[i]);
}

/** An enemy's total REC: `buff.rec` minus Sick. */
function enemyRecTotal(enemy: BattleEnemy): number {
  return attackTotal({
    atk: enemy.stats.rec,
    statMods: buffTotal(enemy.effects, "buff.rec") - statPenalty(enemy.effects, "rec"),
  });
}

/**
 * Applies an enemy skill's effects at its action start (GAME_DESIGN §2 Enemy phase, M1-07C), in
 * list order, before its hits are planned. Targets read from the enemy's side: `self` and `ally`
 * are the enemy itself, `party` every enemy in the wave, `enemy` the AI's target unit, and
 * `enemies` every party unit. Effects use the burst path with source `bb`: ailments roll one draw
 * per living target and take the §2 duration for the recipient's side. `heal.instant` heals a
 * living target (healer REC = the enemy's), `bb.fill_instant` fills a living party unit's gauge
 * (enemies have none), and `od.fill_instant` is ignored (the OD gauge is the player's).
 */
function applyEnemySkillEffects(
  m: TurnMutable,
  actor: BattleEnemy,
  skill: EnemySkill,
  target: PlayerSlotId | undefined,
  tick: number,
  events: BattleEvent[],
): void {
  const elementSets = new Set<string>();
  for (const effect of skill.effects) {
    if (effect.id === "od.fill_instant") continue;
    const live = effect.turns !== 0;
    if (effect.target === "self" || effect.target === "ally" || effect.target === "party") {
      const healer = enemyRecTotal(m.enemies.find((e) => e.slot === actor.slot) ?? actor);
      m.enemies = m.enemies.map((enemy) => {
        if (effect.target !== "party" && enemy.slot !== actor.slot) return enemy;
        if (effect.element !== undefined && effect.element !== enemy.element) return enemy;
        const effects = applyBurstEffect(m, enemy, effect, "bb", "enemy", elementSets);
        if (effect.id === "heal.instant") {
          if (!live || enemy.hp <= 0) return enemy;
          const roll = burstHealAmount(effect, enemyRecTotal(enemy), healer, m.rng);
          m.rng = roll.rng;
          const hp = Math.min(enemy.stats.hp, enemy.hp + roll.value);
          events.push({
            type: "HpRestored",
            tick,
            actor: actor.slot,
            target: enemy.slot,
            effect: "heal.instant",
            amount: hp - enemy.hp,
            hp,
          });
          return { ...enemy, effects, hp };
        }
        if (effect.id === "bb.fill_instant" || !changed(enemy.effects, effects)) {
          return { ...enemy, effects };
        }
        events.push({
          type: "EnemyEffectApplied",
          tick,
          actor: actor.slot,
          target: enemy.slot,
          effect,
        });
        pushEnded(events, tick, enemy.slot, enemy.effects, effects);
        return { ...enemy, effects };
      });
      continue;
    }
    m.party = m.party.map((unit) => {
      if (effect.target === "enemy" && unit.slot !== target) return unit;
      // A DoT keeps the inflicting enemy's unbuffed ATK and element (BF Wiki *DoT*; RESOLVED-49).
      const stored =
        effect.id === "debuff.dot"
          ? { ...effect, dotAtk: actor.stats.atk, dotElement: actor.element }
          : effect;
      const effects = applyBurstEffect(m, unit, stored, "bb", "party", elementSets);
      if (effect.id === "heal.instant" && live && unit.hp > 0) {
        const roll = burstHealAmount(
          effect,
          attackTotal({ atk: unit.stats.rec, statMods: recStatMods(unit) }),
          enemyRecTotal(actor),
          m.rng,
        );
        m.rng = roll.rng;
        const hp = Math.min(unit.stats.hp, unit.hp + roll.value);
        events.push({
          type: "HpRestored",
          tick,
          actor: actor.slot,
          target: unit.slot,
          effect: "heal.instant",
          amount: hp - unit.hp,
          hp,
        });
        return { ...unit, effects, hp };
      }
      if (effect.id === "bb.fill_instant" && live && unit.hp > 0) {
        const bc = fillGauge(unit, effect.value);
        events.push({
          type: "GaugeFilled",
          tick,
          actor: actor.slot,
          target: unit.slot,
          effect: "bb.fill_instant",
          gained: bc - unit.bc,
          gauge: bc,
        });
        return { ...unit, effects, bc };
      }
      if (changed(unit.effects, effects)) {
        events.push({
          type: "EnemyEffectApplied",
          tick,
          actor: actor.slot,
          target: unit.slot,
          effect,
        });
        pushEnded(events, tick, unit.slot, unit.effects, effects);
      }
      return { ...unit, effects };
    });
  }
}

/**
 * Enemy phase (GAME_DESIGN §2): each living enemy in slot order takes its turn. A paralyzed enemy
 * loses it; otherwise its AI picks a skill and target, the skill's effects apply, and the action's
 * hits land in time order,
 * each enemy starting when the previous one's last hit lands. Stops once the party has fallen.
 * Returns the tick after the phase.
 */
function enemyPhase(m: TurnMutable, start: number, events: BattleEvent[]): number {
  let tick = start;
  m.enemies.forEach((_, e) => {
    const enemy = m.enemies[e];
    if (!enemy || enemy.hp <= 0 || allDefeated(m.party)) return;
    const enemyTurn = enemy.turnsTaken + 1;
    if (isParalyzed(enemy.effects)) {
      m.enemies[e] = { ...enemy, turnsTaken: enemyTurn };
      events.push({
        type: "EnemyActionStarted",
        tick,
        actor: enemy.slot,
        enemyTurn,
        hits: 0,
        paralyzed: true,
      });
      return;
    }
    const decision = evaluateEnemyAi({
      enemy,
      rules: enemy.ai,
      enemyTurn,
      party: m.party,
      memory: enemy.aiMemory,
      rng: m.rng,
    });
    m.rng = decision.rng;
    m.enemies[e] = { ...enemy, aiMemory: decision.memory, turnsTaken: enemyTurn };
    const skill = enemy.skills.find((s) => s.id === decision.skill);
    const applied: BattleEvent[] = [];
    if (skill) applyEnemySkillEffects(m, enemy, skill, decision.target, tick, applied);
    const acting = m.enemies[e] ?? enemy;
    const attacks = skill ? skill.attacks : [enemy.normalAttack];
    const plans = skill ? attackPlans(skill) : [NORMAL_ATTACK_PLAN];
    const hits = planEnemyHits(m, acting, attacks, plans, decision.target, tick);
    events.push({
      type: "EnemyActionStarted",
      tick,
      actor: enemy.slot,
      enemyTurn,
      skill: decision.skill,
      ruleIndex: decision.ruleIndex,
      ...(decision.target === undefined ? {} : { target: decision.target }),
      hits: hits.length,
    });
    events.push(...applied);
    tick = resolveEnemyHits(m, acting, hits, tick, events);
  });
  return tick;
}

/**
 * End-of-turn tick (GAME_DESIGN §2, RESOLVED-38 item 11): poison, then damage over time (each
 * party, then enemies), heal over
 * time, BB fill per turn, OD +500, then effect durations, guard, and the Overdrive countdown.
 */
function endOfTurnTick(m: TurnMutable, tick: number, events: BattleEvent[]): void {
  // 1. Poison.
  m.party = m.party.map((unit) => {
    const damage = unit.hp > 0 ? poisonDamage(unit.effects, unit.stats.hp) : 0;
    if (damage <= 0) return unit;
    const ko = takeUnitDamage(unit, unit.effects, damage, m.rng);
    m.rng = ko.rng;
    events.push({
      type: "TurnDamaged",
      tick,
      target: unit.slot,
      effect: "ailment.inflict.poison",
      damage,
      hp: ko.hp,
      ...(ko.survived ? { survived: true as const } : {}),
    });
    if (ko.hp === 0) events.push({ type: "UnitDefeated", tick, target: unit.slot });
    return {
      ...unit,
      hp: ko.hp,
      effects: ko.effects,
      ...("passiveAngelIdol" in ko ? { passiveAngelIdol: ko.passiveAngelIdol } : {}),
    };
  });
  m.enemies = m.enemies.map((enemy) => {
    const damage = enemy.hp > 0 ? poisonDamage(enemy.effects, enemy.stats.hp) : 0;
    if (damage <= 0) return enemy;
    const ko = takeDamage(enemy.effects, enemy.hp, enemy.stats.hp, damage, m.rng);
    m.rng = ko.rng;
    events.push({
      type: "TurnDamaged",
      tick,
      target: enemy.slot,
      effect: "ailment.inflict.poison",
      damage,
      hp: ko.hp,
      ...(ko.survived ? { survived: true as const } : {}),
    });
    if (ko.hp === 0) events.push({ type: "EnemyDefeated", tick, target: enemy.slot });
    return { ...enemy, hp: ko.hp, effects: ko.effects };
  });
  // 1b. Damage over time, party then enemies, against the holder's total DEF now (RESOLVED-49).
  m.party = m.party.map((unit) => {
    if (unit.hp <= 0) return unit;
    const def = attackTotal({ atk: unit.stats.def, statMods: defStatMods(unit) });
    const damage = dotDamage(unit.effects, def, unit.element);
    if (damage <= 0) return unit;
    const ko = takeUnitDamage(unit, unit.effects, damage, m.rng);
    m.rng = ko.rng;
    events.push({
      type: "TurnDamaged",
      tick,
      target: unit.slot,
      effect: "debuff.dot",
      damage,
      hp: ko.hp,
      ...(ko.survived ? { survived: true as const } : {}),
    });
    if (ko.hp === 0) events.push({ type: "UnitDefeated", tick, target: unit.slot });
    return {
      ...unit,
      hp: ko.hp,
      effects: ko.effects,
      ...("passiveAngelIdol" in ko ? { passiveAngelIdol: ko.passiveAngelIdol } : {}),
    };
  });
  m.enemies = m.enemies.map((enemy) => {
    if (enemy.hp <= 0) return enemy;
    const def = attackTotal({
      atk: enemy.stats.def,
      statMods:
        buffTotal(enemy.effects, "buff.def") +
        passiveStatTotal(enemy.effects, "def") -
        statPenalty(enemy.effects, "def"),
    });
    const damage = dotDamage(enemy.effects, def, enemy.element);
    if (damage <= 0) return enemy;
    const ko = takeDamage(enemy.effects, enemy.hp, enemy.stats.hp, damage, m.rng);
    m.rng = ko.rng;
    events.push({
      type: "TurnDamaged",
      tick,
      target: enemy.slot,
      effect: "debuff.dot",
      damage,
      hp: ko.hp,
      ...(ko.survived ? { survived: true as const } : {}),
    });
    if (ko.hp === 0) events.push({ type: "EnemyDefeated", tick, target: enemy.slot });
    return { ...enemy, hp: ko.hp, effects: ko.effects };
  });
  // 2. Heal over time (units killed in step 1 get none).
  m.party = m.party.map((unit) => {
    if (unit.hp <= 0 || !unit.effects.some((effect) => effect.id === "heal.over_time")) {
      return unit;
    }
    const recTotal = attackTotal({ atk: unit.stats.rec, statMods: recStatMods(unit) });
    const heal = healOverTimeAmount(unit.effects, recTotal, m.rng);
    m.rng = heal.rng;
    const hp = Math.min(unit.stats.hp, unit.hp + heal.value);
    if (hp === unit.hp) return unit;
    events.push({
      type: "HpRestored",
      tick,
      target: unit.slot,
      effect: "heal.over_time",
      amount: hp - unit.hp,
      hp,
    });
    return { ...unit, hp };
  });
  // 3. BB fill per turn.
  m.party = m.party.map((unit) => {
    const fill = bcFillPerTurn(unit.effects);
    const bc = fill > 0 ? fillGauge(unit, fill) : unit.bc;
    if (bc === unit.bc) return unit;
    events.push({
      type: "GaugeFilled",
      tick,
      actor: unit.slot,
      target: unit.slot,
      effect: "bb.fill_per_turn",
      gained: bc - unit.bc,
      gauge: bc,
    });
    return { ...unit, bc };
  });
  // 4. OD +500 × (1 + the highest living unit's OD fill rate).
  const rates = m.party.filter((unit) => unit.hp > 0).map((unit) => odFillRate(unit.effects));
  const before = m.od.points;
  m.od = addOd(m.od, turnEndOdYield(rates.length > 0 ? Math.max(...rates) : 0));
  if (m.od.points > before) {
    events.push({
      type: "OdGained",
      tick,
      gained: m.od.points - before,
      points: m.od.points,
      limit: m.od.limit,
    });
  }
  // 5. Durations, guard, and the Overdrive countdown.
  m.party = m.party.map((unit) => {
    const next = endOverdriveTurn({
      ...unit,
      effects: tickEffects(unit.effects),
      guarding: false,
      ...(unit.passiveAngelIdol
        ? { passiveAngelIdol: { ...unit.passiveAngelIdol, protected: false } }
        : {}),
    });
    pushEnded(events, tick, unit.slot, unit.effects, next.effects);
    if (unit.overdrive && !next.overdrive) {
      events.push({ type: "OverdriveEnded", tick, actor: unit.slot });
    }
    return next;
  });
  m.enemies = m.enemies.map((enemy) => {
    const effects = tickEffects(enemy.effects);
    pushEnded(events, tick, enemy.slot, enemy.effects, effects);
    return { ...enemy, effects };
  });
}

function finish(
  state: BattleState,
  m: TurnMutable,
  tick: number,
  result: BattleResult,
  events: BattleEvent[],
): StepResult {
  events.push({ type: "BattleEnded", tick, result, turn: state.turn });
  return {
    state: {
      ...state,
      rng: m.rng,
      tick,
      party: m.party,
      enemies: m.enemies,
      od: m.od,
      result,
    },
    events,
  };
}

/**
 * Ends the player phase and runs the rest of the turn (GAME_DESIGN §2 Turn loop): if the last wave
 * is already cleared the battle is won at once; otherwise the enemy phase (skipped when the wave
 * is cleared), the end-of-turn tick, then wave advancement and the next turn's start (`acted`
 * cleared, passives refreshed, `TurnStarted`). A fallen party loses (`BattleEnded` is the last
 * event). The timeline must be empty (`step` without `untilTick` drains it).
 */
export function endTurn(state: BattleState): StepResult {
  if (state.result !== undefined) {
    throw new BattleInputError(`endTurn: the battle is over (${state.result})`);
  }
  if (state.timeline.length > 0) {
    throw new BattleInputError(
      `endTurn: ${state.timeline.length} hits are still pending; step until the timeline is empty`,
    );
  }
  const m: TurnMutable = {
    rng: state.rng,
    party: [...state.party],
    enemies: [...state.enemies],
    od: state.od,
  };
  const events: BattleEvent[] = [];
  const lastWave = state.waveIndex >= state.waves.length - 1;
  let tick = state.tick;
  if (allDefeated(m.enemies) && lastWave) return finish(state, m, tick, "win", events);
  if (!allDefeated(m.enemies)) {
    tick = enemyPhase(m, tick, events);
    if (allDefeated(m.party)) return finish(state, m, tick, "lose", events);
  }
  endOfTurnTick(m, tick, events);
  if (allDefeated(m.party)) return finish(state, m, tick, "lose", events);
  let waveIndex = state.waveIndex;
  if (allDefeated(m.enemies)) {
    if (lastWave) return finish(state, m, tick, "win", events);
    events.push({ type: "WaveCleared", tick, wave: waveIndex });
    waveIndex += 1;
    m.enemies = spawnWave(state.waves[waveIndex] ?? []);
    events.push({ type: "WaveStarted", tick, wave: waveIndex });
  }
  const turn = state.turn + 1;
  const next = refreshPassives({
    ...state,
    rng: m.rng,
    tick,
    turn,
    phase: "player",
    party: m.party,
    enemies: m.enemies,
    waveIndex,
    od: m.od,
    acted: [],
    recentHits: [],
  });
  events.push({ type: "TurnStarted", tick, turn });
  return { state: next, events };
}

/**
 * One whole turn: the player phase (`step` with `inputs`, run until every hit lands) followed by
 * `endTurn`. Events are the two logs concatenated.
 */
export function playTurn(state: BattleState, inputs: readonly BattleInput[]): StepResult {
  const player = step(state, inputs);
  const rest = endTurn(player.state);
  return { state: rest.state, events: [...player.events, ...rest.events] };
}
