import { AILMENTS, type Effect, type EnemySkill } from "@bfr/data";
import { describe, expect, it } from "vitest";
import { continueBattle } from "./actions/continue.ts";
import { evaluateEnemyAi } from "./ai/evaluate.ts";
import { type ActiveEffect, removeBuffs } from "./effects/buffs.ts";
import { applyEffect } from "./effects/index.ts";
import { refreshPassives } from "./effects/passive.ts";
import { takeUnitDamage } from "./effects/survival.ts";
import type {
  BattleEndedEvent,
  BattleEvent,
  EnemyActionStartedEvent,
  EnemyHitLandedEvent,
} from "./events.ts";
import { attackTotal } from "./formulas/attack-stat.ts";
import { attackCore, hitDamage, rollAttack } from "./formulas/damage.ts";
import { elementMultiplier } from "./formulas/element.ts";
import { nextInt } from "./rng.ts";
import { createBattle } from "./state/create-battle.ts";
import type { BattleSetup, BattleState, BattleUnit, EnemySetup } from "./state/types.ts";
import { BattleInputError, step } from "./step.ts";
import { ENEMY_NORMAL_ATTACK, makeEnemy, makeMember, makeSetup } from "./test/factories.ts";
import type { BattleInput } from "./timeline/types.ts";
import { endTurn, playTurn } from "./turn.ts";

function ofType<T extends BattleEvent["type"]>(
  events: readonly BattleEvent[],
  type: T,
): Extract<BattleEvent, { type: T }>[] {
  return events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);
}

function withEffect(effects: readonly ActiveEffect[], effect: Effect): ActiveEffect[] {
  return applyEffect(effects, effect, "bb");
}

function patchUnit(state: BattleState, slot: string, patch: Partial<BattleUnit>): BattleState {
  return { ...state, party: state.party.map((u) => (u.slot === slot ? { ...u, ...patch } : u)) };
}

/** One unit against one enemy, single wave (no wave advancement). */
function duel(enemy: EnemySetup = makeEnemy("brute"), seed = 3): BattleState {
  return createBattle({ squad: [makeMember("solo")], leaderIndex: 0, waves: [[enemy]] }, seed);
}

/** Every living unit bursts when its BB is charged, else attacks the first living enemy. */
function autoInputs(state: BattleState): BattleInput[] {
  return state.party
    .filter((unit) => unit.hp > 0)
    .map((unit) =>
      unit.bc >= unit.form.bursts.bb.cost
        ? { type: "burst", tick: state.tick, actor: unit.slot, tier: "bb" }
        : { type: "attack", tick: state.tick, actor: unit.slot },
    );
}

function playOut(start: BattleState, maxTurns = 60): { state: BattleState; log: BattleEvent[] } {
  let state = start;
  const log: BattleEvent[] = [];
  for (let i = 0; i < maxTurns && state.result === undefined; i++) {
    const turn = playTurn(state, autoInputs(state));
    log.push(...turn.events);
    state = turn.state;
  }
  return { state, log };
}

function threeWaveSetup(): BattleSetup {
  const foe = (id: string, hp: number): EnemySetup => ({
    ...makeEnemy(id),
    stats: { hp, atk: 900, def: 400, rec: 100 },
  });
  return {
    ...makeSetup(5),
    waves: [
      [foe("slime", 6000), foe("slime", 6000)],
      [foe("imp", 8000), foe("imp", 8000), foe("imp", 8000)],
      [foe("boss", 40000)],
    ],
  };
}

describe("SP ailment counters (RESOLVED-77)", () => {
  const counter = [{ ailment: "injury" as const, chance: 100 }];
  function armed(seed = 3, hits = 2): BattleState {
    const start = duel(
      {
        ...makeEnemy("counter-target"),
        normalAttack: {
          ...ENEMY_NORMAL_ATTACK,
          hitFrames: Array.from({ length: hits }, (_, i) => i * 10),
          damageDistribution: Array.from({ length: hits }, () => 100 / hits),
        },
      },
      seed,
    );
    return patchUnit(start, "p0", { enhancementAilmentCounters: counter });
  }
  function damageRng(start: BattleState) {
    const enemy = start.enemies[0];
    if (!enemy) throw new Error("missing enemy");
    const ai = evaluateEnemyAi({
      enemy,
      rules: enemy.ai,
      enemyTurn: 1,
      party: start.party,
      memory: enemy.aiMemory,
      rng: start.rng,
    });
    return rollAttack(ai.rng, 0).rng;
  }
  it("rolls per ailment in fixed order once at the last hit, even against immunity", () => {
    let landed = 0;
    let missed = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const start = patchUnit(armed(seed), "p0", {
        enhancementAilmentCounters: AILMENTS.map((ailment) => ({ ailment, chance: 50 })),
      });
      let rng = damageRng(start);
      const expected: string[] = [];
      for (const ailment of AILMENTS) {
        const draw = nextInt(rng, 0, 99);
        rng = draw.rng;
        if (draw.value < 50) {
          expected.push(`ailment.inflict.${ailment}`);
          landed++;
        } else missed++;
      }
      const result = endTurn(start);
      const hits = ofType(result.events, "EnemyHitLanded");
      const applied = ofType(result.events, "AilmentCounterApplied");
      expect(applied.map((e) => e.effect.id)).toEqual(expected);
      expect(applied.every((e) => e.tick === hits.at(-1)?.tick)).toBe(true);
      expect(applied.every((e) => e.actor === "p0" && e.target === "e0")).toBe(true);
      for (const event of applied) {
        expect(event.effect.turns).toBe(
          event.effect.id.endsWith("curse") || event.effect.id.endsWith("paralysis") ? 1 : 3,
        );
      }
      expect(result.state.rng).toEqual(rng);
      expect(endTurn(JSON.parse(JSON.stringify(start)))).toEqual(result);
      const immune = {
        ...start,
        enemies: start.enemies.map((e) => ({
          ...e,
          effects: applyEffect(
            e.effects,
            { id: "ailment.null", value: 1, target: "self", turns: 3 },
            "bb",
          ),
        })),
      };
      const blocked = endTurn(immune);
      expect(ofType(blocked.events, "AilmentCounterApplied")).toEqual([]);
      expect(blocked.state.rng).toEqual(rng);
      // Attack damage is planned before Injury counters land; hit count does not change it.
      const plain = endTurn(patchUnit(start, "p0", { enhancementAilmentCounters: undefined }));
      expect(hits).toEqual(ofType(plain.events, "EnemyHitLanded"));
    }
    expect(landed).toBeGreaterThan(0);
    expect(missed).toBeGreaterThan(0);
  });
  it("resolves after heal, BC fill and reflect without recursive reactions", () => {
    const seed = Array.from({ length: 100 }, (_, i) => i + 1).find((seed) => {
      const heal = nextInt(damageRng(armed(seed)), 0, 99);
      const fill = nextInt(heal.rng, 2, 3);
      return heal.value < 50 && nextInt(fill.rng, 0, 99).value < 50;
    });
    if (seed === undefined) throw new Error("missing proc seed");
    const start = armed(seed);
    const unit = start.party[0];
    if (!unit) throw new Error("missing unit");
    const effects: Effect[] = [
      { id: "damage_to_heal", value: 0.1, chance: 50, target: "self", turns: 3 },
      { id: "bb.fill_on_hit", value: 0, min: 2, max: 3, target: "self", turns: 3 },
      { id: "damage_reflect", value: 0.1, chance: 50, target: "self", turns: 3 },
    ];
    const prepared = patchUnit(start, "p0", {
      effects: effects.reduce((list, e) => applyEffect(list, e, "bb"), unit.effects),
    });
    let rng = damageRng(start);
    rng = nextInt(rng, 0, 99).rng; // Heal proc.
    rng = nextInt(rng, 2, 3).rng; // Ranged BC fill.
    rng = nextInt(rng, 0, 99).rng; // Reflect proc.
    rng = nextInt(rng, 0, 99).rng; // Guaranteed counter still draws.
    const result = endTurn(prepared);
    expect(result.state.rng).toEqual(rng);
    const types = result.events.map((e) => e.type);
    for (const type of ["HpRestored", "GaugeFilled", "CounterDamaged"] as const) {
      expect(types).toContain(type);
      expect(types.indexOf(type)).toBeLessThan(types.indexOf("AilmentCounterApplied"));
    }
    expect(types.indexOf("HpRestored")).toBeLessThan(types.indexOf("GaugeFilled"));
    expect(types.indexOf("GaugeFilled")).toBeLessThan(types.indexOf("CounterDamaged"));
    expect(ofType(result.events, "AilmentCounterApplied")).toHaveLength(1);
    expect(
      result.state.enemies[0]?.effects.find((e) => e.id === "ailment.inflict.injury")?.turns,
    ).toBe(2);
  });
  it("does not trigger from fully absorbed attacks or a KO, but idol HP loss qualifies", () => {
    const start = armed();
    const unit = start.party[0];
    if (!unit) throw new Error("missing unit");
    const shield = patchUnit(start, "p0", {
      effects: applyEffect(
        unit.effects,
        { id: "barrier", value: 99999, target: "self", turns: 3 },
        "bb",
      ),
    });
    for (const blocked of [shield, patchUnit(start, "p0", { hp: 1 })]) {
      const result = endTurn(blocked);
      expect(ofType(result.events, "AilmentCounterApplied")).toEqual([]);
      expect(result.state.rng).toEqual(damageRng(blocked));
    }
    const saved = patchUnit(start, "p0", {
      hp: 2,
      passiveAngelIdol: {
        chance: 100,
        consumed: false,
        protected: false,
      },
    });
    const result = endTurn(saved);
    expect(result.state.party[0]?.hp).toBe(1);
    expect(ofType(result.events, "AilmentCounterApplied")).toHaveLength(1);
    expect(result.state.rng).toEqual(nextInt(damageRng(saved), 0, 99).rng);
    // At 1 HP, turn protection does not negate damage, but zero HP loss gives no counter.
    const protectedStart = patchUnit(start, "p0", {
      hp: 1,
      passiveAngelIdol: {
        chance: 100,
        consumed: true,
        protected: true,
      },
    });
    expect(ofType(endTurn(protectedStart).events, "AilmentCounterApplied")).toEqual([]);
  });
  it("counts each random hit separately and never reacts to poison or DoT alone", () => {
    const start = armed();
    const enemy = start.enemies[0];
    const unit = start.party[0];
    if (!enemy || !unit) throw new Error("missing combatants");
    const random: EnemySkill = {
      id: "random",
      name: "Random",
      attacks: [enemy.normalAttack],
      effects: [{ id: "attack.random", value: 0, target: "enemies" }],
    };
    const randomStart = {
      ...start,
      enemies: [
        {
          ...enemy,
          skills: [random],
          ai: [{ when: "default" as const, skill: "random", target: "random" as const }],
        },
      ],
    };
    const result = endTurn(randomStart);
    expect(ofType(result.events, "AilmentCounterApplied")).toHaveLength(2);
    expect(ofType(result.events, "AilmentCounterApplied").map((e) => e.tick)).toEqual(
      ofType(result.events, "EnemyHitLanded").map((e) => e.tick),
    );
    const idle = {
      ...start,
      enemies: [
        {
          ...enemy,
          effects: applyEffect(
            [],
            {
              id: "ailment.inflict.paralysis",
              value: 100,
              target: "self",
              turns: 1,
            },
            "bb",
          ),
        },
      ],
    };
    const ticking = patchUnit(idle, "p0", {
      effects: [
        { id: "ailment.inflict.poison", value: 100, target: "self", turns: 3, source: "bb" },
        {
          id: "debuff.dot",
          value: 1,
          dotAtk: 1000,
          dotElement: "earth",
          target: "self",
          turns: 3,
          source: "bb",
        },
      ],
    });
    const ticked = endTurn(ticking);
    expect(ofType(ticked.events, "TurnDamaged")).toHaveLength(2);
    expect(ofType(ticked.events, "AilmentCounterApplied")).toEqual([]);
    expect(ticked.state.rng).toEqual(ticking.rng);
  });
});

describe("turn loop (M1-07B)", () => {
  it("plays a full 3-wave battle headlessly to a win", () => {
    const start = createBattle(threeWaveSetup(), 2024);
    const { state, log } = playOut(start);

    expect(state.result).toBe("win");
    expect(state.waveIndex).toBe(2);
    expect(state.enemies.every((e) => e.hp === 0)).toBe(true);
    const last = log[log.length - 1] as BattleEndedEvent;
    expect(last).toMatchObject({ type: "BattleEnded", result: "win", turn: state.turn });
    expect(ofType(log, "BattleEnded")).toHaveLength(1);
    expect(ofType(log, "WaveCleared").map((e) => e.wave)).toEqual([0, 1]);
    expect(ofType(log, "WaveStarted").map((e) => e.wave)).toEqual([1, 2]);
    // Several turns passed, and the enemies fought back.
    expect(state.turn).toBeGreaterThan(3);
    expect(ofType(log, "EnemyHitLanded").length).toBeGreaterThan(0);
    expect(ofType(log, "TurnStarted").map((e) => e.turn)).toEqual(
      Array.from({ length: state.turn - 1 }, (_, i) => i + 2),
    );
    // Events are in non-decreasing tick order.
    log.forEach((event, i) => {
      expect(event.tick).toBeGreaterThanOrEqual(log[i - 1]?.tick ?? 0);
    });

    // Same seed and inputs ⇒ same log; the state survives a JSON round trip mid-battle.
    expect(playOut(createBattle(threeWaveSetup(), 2024)).log).toEqual(log);
    const mid = playTurn(start, autoInputs(start)).state;
    expect(JSON.parse(JSON.stringify(mid))).toEqual(mid);
    expect(playOut(JSON.parse(JSON.stringify(mid))).state).toEqual(playOut(mid).state);
  });

  it("loses when the party falls, then refuses further play", () => {
    const enemy = { ...makeEnemy("titan"), stats: { hp: 99999, atk: 60000, def: 500, rec: 1 } };
    const start = duel(enemy);
    const { state, events } = playTurn(start, [{ type: "attack", tick: 0, actor: "p0" }]);

    expect(state.result).toBe("lose");
    expect(state.party[0]?.hp).toBe(0);
    expect(ofType(events, "UnitDefeated")).toEqual([
      expect.objectContaining({ type: "UnitDefeated", target: "p0" }),
    ]);
    expect(events[events.length - 1]).toMatchObject({ type: "BattleEnded", result: "lose" });
    expect(ofType(events, "TurnStarted")).toEqual([]);

    expect(() => endTurn(state)).toThrow(/the battle is over \(lose\)/);
    const after = step(state, [{ type: "attack", tick: state.tick, actor: "p0" }]);
    expect(after.events).toEqual([
      { type: "ActionRejected", tick: state.tick, actor: "p0", reason: "battle_over" },
    ]);
  });

  it("wins at once when the last wave is already cleared", () => {
    const start = duel();
    const cleared = { ...start, enemies: start.enemies.map((e) => ({ ...e, hp: 0 })) };
    const { state, events } = endTurn(cleared);
    expect(events).toEqual([{ type: "BattleEnded", tick: 0, result: "win", turn: 1 }]);
    expect(state.result).toBe("win");
    expect(state.rng).toEqual(start.rng);
  });

  it("skips the enemy phase and advances the wave when the wave is cleared", () => {
    const start = createBattle(makeSetup(2), 5);
    const acted = step(start, [{ type: "guard", tick: 0, actor: "p0" }]).state;
    const cleared = { ...acted, enemies: acted.enemies.map((e) => ({ ...e, hp: 0 })) };
    const { state, events } = endTurn(cleared);

    expect(ofType(events, "EnemyActionStarted")).toEqual([]);
    expect(events.map((e) => e.type)).toEqual([
      "OdGained",
      "WaveCleared",
      "WaveStarted",
      "TurnStarted",
    ]);
    expect(state).toMatchObject({ turn: 2, waveIndex: 1, acted: [], phase: "player" });
    expect(state.enemies.map((e) => [e.slot, e.enemyId, e.hp])).toEqual([["e0", "boss", 10000]]);
    expect(state.party[0]?.guarding).toBe(false);
  });

  it("removes the party's timed buffs and debuffs on a wave change, except Max HP boosts", () => {
    const start = createBattle(makeSetup(2), 5);
    const maxHp: ActiveEffect = {
      id: "passive.stat_pct",
      stat: "hp",
      value: 0.2,
      target: "self",
      source: "bb",
    };
    let effects = withEffect([], { id: "buff.atk", value: 0.5, turns: 3, target: "party" });
    effects = withEffect(effects, { id: "buff.def", value: 0.5, turns: 1, target: "party" });
    effects = withEffect(effects, { id: "debuff.atk_down", value: 0.3, turns: 3, target: "enemy" });
    effects = withEffect(effects, {
      id: "ailment.inflict.weak",
      value: 1,
      turns: 3,
      target: "enemy",
    });
    effects = [...effects, maxHp];
    const buffed = patchUnit(start, "p0", {
      effects,
      hp: 500,
      bc: 9,
      overdrive: true,
      overdriveTurns: 3,
    });
    const cleared = { ...buffed, enemies: buffed.enemies.map((e) => ({ ...e, hp: 0 })) };
    const { state, events } = endTurn(cleared);

    const p0 = state.party[0];
    // Ailments, passives, and the Max HP boost survive; durations ticked once first.
    expect(p0?.effects.filter((e) => e.source !== "leader").map((e) => e.id)).toEqual([
      "ailment.inflict.weak",
      "passive.stat_pct",
    ]);
    expect(p0?.effects.find((e) => e.id === "ailment.inflict.weak")?.turns).toBe(2);
    expect(p0?.effects).toContainEqual(maxHp);
    expect(p0).toMatchObject({ hp: 500, bc: 9, overdrive: true });
    // The OD gauge keeps its points (the end-of-turn tick still adds its fill); items untouched.
    expect(state.od.points).toBeGreaterThanOrEqual(cleared.od.points);
    expect(state.items).toEqual(cleared.items);

    // buff.def expired in the end-of-turn tick; the wave change ends the rest, once per ID.
    const ended = ofType(events, "EffectEnded").filter((e) => e.target === "p0");
    expect(ended.map((e) => e.effect)).toEqual(["buff.def", "buff.atk", "debuff.atk_down"]);
    const types = events.map((e) => e.type);
    const waveCleared = types.indexOf("WaveCleared");
    const lastEnded = types.lastIndexOf("EffectEnded");
    expect(waveCleared).toBeLessThan(lastEnded);
    expect(lastEnded).toBeLessThan(types.indexOf("WaveStarted"));
  });

  it("removeBuffs drops Max HP boosts too unless asked to keep them", () => {
    const maxHp: ActiveEffect = {
      id: "passive.stat_pct",
      stat: "hp",
      value: 0.2,
      target: "self",
      source: "bb",
    };
    const effects = [
      ...withEffect([], { id: "buff.atk", value: 0.5, turns: 3, target: "party" }),
      maxHp,
    ];
    expect(removeBuffs(effects, { keepMaxHp: true })).toEqual([maxHp]);
    expect(removeBuffs(effects, { keepMaxHp: false })).toEqual([]);
  });

  it("clears the spark-assist memory at the end of the turn", () => {
    const start = createBattle({ ...makeSetup(2), sparkAssist: true }, 5);
    const player = step(start, [{ type: "attack", tick: 0, actor: "p0" }]).state;
    expect(player.recentHits.length).toBeGreaterThan(0);
    const { state } = endTurn(player);
    expect(state.recentHits).toEqual([]);
    expect(state.sparkWindowTicks).toBe(2);
  });

  it("rejects endTurn while hits are pending", () => {
    const start = createBattle(makeSetup(1), 1);
    const mid = step(start, [{ type: "attack", tick: 0, actor: "p0" }], { untilTick: 5 }).state;
    expect(mid.timeline.length).toBeGreaterThan(0);
    expect(() => endTurn(mid)).toThrow(BattleInputError);
  });

  it("deals the §3 enemy damage, halved by guard and cut by mitigation (reference)", () => {
    const start = duel();
    const unit = start.party[0];
    const enemy = start.enemies[0];
    if (!unit || !enemy) throw new Error("duel setup");

    // Replay the draws: AI target (random over 1 unit), then crit roll, variance, divisor.
    const decision = evaluateEnemyAi({
      enemy,
      rules: enemy.ai,
      enemyTurn: 1,
      party: start.party,
      memory: enemy.aiMemory,
      rng: start.rng,
    });
    const rolls = rollAttack(decision.rng, 0);
    const core = attackCore({
      atkTotal: attackTotal({ atk: 800 }),
      targetDef: 1100,
      rolls: rolls.value,
      elementMult: elementMultiplier({ attacker: "earth", defender: "fire" }),
    });

    const plain = endTurn(start).events;
    expect(ofType(plain, "EnemyHitLanded")).toEqual([
      {
        type: "EnemyHitLanded",
        tick: ENEMY_NORMAL_ATTACK.startDelayFrames,
        actor: "e0",
        target: "p0",
        attackIndex: 0,
        hitIndex: 0,
        critical: false,
        element: "resist",
        damage: hitDamage(core, 100),
        unitHp: unit.hp - hitDamage(core, 100),
      },
    ]);

    const guarded = patchUnit(start, "p0", {
      guarding: true,
      effects: withEffect([], { id: "mitigation", value: 0.5, turns: 2, target: "self" }),
    });
    const [hit] = ofType(endTurn(guarded).events, "EnemyHitLanded");
    expect(hit?.damage).toBe(hitDamage(core, 100, { guard: 0.5, mitigation: 0.5 }));
    expect(hit?.damage).toBeLessThan(hitDamage(core, 100) / 3);
  });

  it("marks weak, resisted, and neutral hits both ways with the element relation", () => {
    // The factory unit is fire. Earth: fire is strong (weak), earth resists fire's attacks back.
    const cases = [
      { element: "earth", dealt: "weak", taken: "resist" },
      { element: "water", dealt: "resist", taken: "weak" },
      { element: "light", dealt: undefined, taken: undefined },
    ] as const;
    for (const { element, dealt, taken } of cases) {
      const start = duel({ ...makeEnemy("foe"), element });
      const { events } = playTurn(start, [{ type: "attack", tick: 0, actor: "p0" }]);
      const hits = ofType(events, "HitLanded");
      const enemyHits = ofType(events, "EnemyHitLanded");
      expect(hits.length).toBeGreaterThan(0);
      expect(enemyHits.length).toBeGreaterThan(0);
      for (const hit of hits) expect(hit.element).toBe(dealt);
      for (const hit of enemyHits) expect(hit.element).toBe(taken);
      if (dealt === undefined) expect(hits.every((hit) => !("element" in hit))).toBe(true);
    }
  });

  it("saves a unit with angel_idol, then heals and fills the gauge after the attack", () => {
    const enemy = { ...makeEnemy("titan"), stats: { hp: 99999, atk: 60000, def: 500, rec: 1 } };
    const start = duel(enemy);
    let effects = withEffect([], { id: "angel_idol", value: 0, turns: 3, target: "self" });
    effects = withEffect(effects, { id: "damage_to_heal", value: 0.1, turns: 3, target: "self" });
    effects = withEffect(effects, { id: "bb.fill_on_hit", value: 4, turns: 3, target: "self" });
    const { state, events } = endTurn(patchUnit(start, "p0", { effects }));

    const [hit] = ofType(events, "EnemyHitLanded");
    expect(hit).toMatchObject({ unitHp: 1, survived: true });
    const dealt = (start.party[0]?.hp ?? 0) - 1;
    expect(ofType(events, "HpRestored")[0]).toMatchObject({
      target: "p0",
      effect: "damage_to_heal",
      amount: Math.floor(dealt * 0.1),
    });
    expect(ofType(events, "GaugeFilled")[0]).toMatchObject({
      effect: "bb.fill_on_hit",
      gained: 4,
      gauge: 4,
    });
    expect(state.result).toBeUndefined();
    expect(state.party[0]?.effects.some((e) => e.id === "angel_idol")).toBe(false);
  });

  it("protects SP saves through repeated lethal hits and poison/DoT, then expires", () => {
    const enemy = {
      ...makeEnemy("titan"),
      stats: { hp: 99999, atk: 60000, def: 500, rec: 1 },
      normalAttack: { ...ENEMY_NORMAL_ATTACK, hitFrames: [0, 10], damageDistribution: [50, 50] },
    };
    const start = patchUnit(
      createBattle({ squad: [makeMember("solo")], leaderIndex: 0, waves: [[enemy, enemy]] }, 3),
      "p0",
      {
        passiveAngelIdol: { chance: 100, consumed: false, protected: false },
        effects: [
          { id: "ailment.inflict.poison", value: 100, turns: 3, target: "self", source: "bb" },
          {
            id: "debuff.dot",
            value: 5,
            flatAtk: 0,
            dotAtk: 60000,
            dotElement: "earth",
            turns: 3,
            target: "self",
            source: "bb",
          },
        ],
      },
    );
    const first = endTurn(start);
    expect(ofType(first.events, "EnemyHitLanded").map((e) => [e.unitHp, e.survived])).toEqual([
      [1, true],
      [1, undefined],
      [1, undefined],
      [1, undefined],
    ]);
    expect(ofType(first.events, "TurnDamaged").map((e) => [e.effect, e.hp])).toEqual([
      ["ailment.inflict.poison", 1],
      ["debuff.dot", 1],
    ]);
    expect(ofType(first.events, "UnitDefeated")).toEqual([]);
    expect(first.state.party[0]?.passiveAngelIdol).toEqual({
      chance: 100,
      consumed: true,
      protected: false,
    });
    const refreshed = refreshPassives(first.state);
    expect(endTurn(JSON.parse(JSON.stringify(refreshed)))).toEqual(endTurn(refreshed));
    const lost = endTurn(refreshed).state;
    expect(lost.result).toBe("lose");
    const continued = continueBattle(lost).state;
    expect(continued.party[0]?.passiveAngelIdol).toEqual({
      chance: 100,
      consumed: true,
      protected: false,
    });
    expect(endTurn(continued).state.result).toBe("lose");
  });

  it("keeps consumed SP allowance across waves and expires a turn-end save before next turn", () => {
    const start = patchUnit(createBattle(makeSetup(1), 5), "p0", {
      hp: 1,
      passiveAngelIdol: { chance: 100, consumed: false, protected: false },
      effects: [
        { id: "ailment.inflict.poison", value: 100, turns: 3, target: "self", source: "bb" },
        {
          id: "debuff.dot",
          value: 5,
          flatAtk: 0,
          dotAtk: 60000,
          dotElement: "earth",
          turns: 3,
          target: "self",
          source: "bb",
        },
      ],
    });
    const cleared = { ...start, enemies: start.enemies.map((e) => ({ ...e, hp: 0 })) };
    const next = endTurn(cleared);
    expect(next.state).toMatchObject({ waveIndex: 1, turn: 2 });
    expect(ofType(next.events, "TurnDamaged").map((e) => [e.hp, e.survived])).toEqual([
      [1, true],
      [1, undefined],
    ]);
    expect(next.state.party[0]?.passiveAngelIdol).toEqual({
      chance: 100,
      consumed: true,
      protected: false,
    });
    expect(endTurn(JSON.parse(JSON.stringify(next.state))).state.result).toBe("lose");
  });

  it("SP protection clamps rather than negates damage and does not consume a burst idol", () => {
    const start = duel();
    const unit = start.party[0];
    if (!unit) throw new Error("missing unit");
    const effects = withEffect(unit.effects, {
      id: "angel_idol",
      value: 1,
      turns: 3,
      target: "self",
    });
    const passiveAngelIdol = { chance: 100, consumed: false, protected: false };
    const first = takeUnitDamage({ ...unit, passiveAngelIdol }, effects, 999999, start.rng);
    expect(first).toMatchObject({ hp: 1, survived: true, effects });
    expect(first.passiveAngelIdol?.consumed).toBe(true);
    const protectedUnit = { ...unit, hp: 100, passiveAngelIdol: first.passiveAngelIdol };
    expect(takeUnitDamage(protectedUnit, effects, 25, first.rng).hp).toBe(75);
    const lethal = takeUnitDamage(protectedUnit, effects, 999999, first.rng);
    expect(lethal).toMatchObject({ hp: 1, survived: false, rng: first.rng, effects });
    // Once protection ends, the ordinary burst idol is still available and keeps legacy behavior.
    const expired = { ...protectedUnit, passiveAngelIdol: { ...passiveAngelIdol, consumed: true } };
    const burstSave = takeUnitDamage(expired, effects, 999999, first.rng);
    expect(burstSave).toMatchObject({ hp: unit.stats.hp, survived: true });
    expect(burstSave.effects.some((e) => e.id === "angel_idol")).toBe(false);
    expect(burstSave.passiveAngelIdol?.protected).toBe(false);
  });

  it("runs the end-of-turn tick in order: poison, HoT, BB per turn, OD, durations", () => {
    const start = duel();
    const enemy = start.enemies[0];
    if (!enemy) throw new Error("duel setup");
    // A paralyzed enemy loses its action, so only the end-of-turn tick changes the unit.
    const paralyzed = {
      ...start,
      enemies: [
        {
          ...enemy,
          effects: withEffect([], {
            id: "ailment.inflict.paralysis",
            value: 100,
            turns: 1,
            target: "enemy",
          }),
        },
      ],
    };
    let effects = withEffect([], {
      id: "ailment.inflict.poison",
      value: 100,
      turns: 3,
      target: "self",
    });
    effects = withEffect(effects, { id: "heal.over_time", value: 150, turns: 2, target: "self" });
    effects = withEffect(effects, { id: "bb.fill_per_turn", value: 3, turns: 1, target: "self" });
    const unit = start.party[0];
    if (!unit) throw new Error("duel setup");
    const state0 = patchUnit(paralyzed, "p0", {
      effects,
      overdrive: true,
      overdriveTurns: 1,
      bc: 10,
    });
    const { state, events } = endTurn(state0);

    const poison = Math.floor(unit.stats.hp * 0.1);
    expect(events.map((e) => e.type)).toEqual([
      "EnemyActionStarted",
      "TurnDamaged",
      "HpRestored",
      "GaugeFilled",
      "OdGained",
      "EffectEnded",
      "OverdriveEnded",
      "EffectEnded",
      "TurnStarted",
    ]);
    // Expiries are reported per ID: p0's 1-turn gauge fill and e0's 1-turn paralysis (M2-07B).
    expect(ofType(events, "EffectEnded")).toMatchObject([
      { target: "p0", effect: "bb.fill_per_turn" },
      { target: "e0", effect: "ailment.inflict.paralysis" },
    ]);
    expect(ofType(events, "EnemyActionStarted")[0]).toMatchObject({
      actor: "e0",
      enemyTurn: 1,
      hits: 0,
      paralyzed: true,
    });
    expect(ofType(events, "TurnDamaged")[0]).toMatchObject({ damage: poison });
    expect(ofType(events, "HpRestored")[0]).toMatchObject({
      effect: "heal.over_time",
      amount: 150,
    });
    expect(ofType(events, "GaugeFilled")[0]).toMatchObject({ gained: 3, gauge: 13 });
    expect(ofType(events, "OdGained")[0]).toMatchObject({ gained: 500, points: 500 });

    const after = state.party[0];
    // Overdrive ran out: the mode ends with an empty gauge; bb.fill_per_turn (1 turn) expired.
    expect(after).toMatchObject({ overdrive: false, overdriveTurns: 0, bc: 0 });
    const lasting = after?.effects.filter((e) => e.source === "bb");
    expect(lasting?.map((e) => [e.id, e.turns])).toEqual([
      ["ailment.inflict.poison", 2],
      ["heal.over_time", 1],
    ]);
    expect(state.enemies[0]?.effects).toEqual([]);
    expect(state.enemies[0]?.turnsTaken).toBe(1);
    expect(state.od.points).toBe(500);
  });

  it("counts enemy turns for the AI and uses an AoE skill on its turn", () => {
    const slam: EnemySkill = {
      id: "slam",
      name: "Slam",
      attacks: [ENEMY_NORMAL_ATTACK],
      effects: [{ id: "attack.aoe", value: 1, target: "enemies" }],
    };
    const enemy: EnemySetup = {
      ...makeEnemy("brute"),
      skills: [slam],
      ai: [
        { when: "every_n_turns", n: 2, skill: "slam", target: "random" },
        { when: "default", skill: "normal", target: "random" },
      ],
    };
    let state = createBattle({ ...makeSetup(3), waves: [[enemy]] }, 9);
    const actions: EnemyActionStartedEvent[] = [];
    const hits: EnemyHitLandedEvent[][] = [];
    for (let turn = 0; turn < 3; turn++) {
      const result = endTurn(state);
      actions.push(...ofType(result.events, "EnemyActionStarted"));
      hits.push(ofType(result.events, "EnemyHitLanded"));
      state = result.state;
    }
    expect(actions.map((a) => [a.enemyTurn, a.skill, a.hits])).toEqual([
      [1, "normal", 1],
      [2, "slam", 3],
      [3, "normal", 1],
    ]);
    expect(hits[1]?.map((h) => h.target)).toEqual(["p0", "p1", "p2"]);
    expect(state.enemies[0]?.turnsTaken).toBe(3);
    expect(state.turn).toBe(4);
  });

  it("rejects enemies whose AI names an unknown skill", () => {
    const enemy: EnemySetup = {
      ...makeEnemy("brute"),
      ai: [{ when: "default", skill: "slam", target: "random" }],
    };
    expect(() => createBattle({ ...makeSetup(1), waves: [[enemy]] }, 1)).toThrow(
      /waves\[0\]\[0\]\.ai\.0\.skill: unknown skill "slam"/,
    );
  });
});

describe("enemy skill effects (M1-07C)", () => {
  /** The expected damage of the next enemy normal attack on `state`'s only unit. */
  function expectedNormalHit(state: BattleState, atkMods: number): number {
    const unit = state.party[0];
    const enemy = state.enemies[0];
    if (!unit || !enemy) throw new Error("duel setup");
    const decision = evaluateEnemyAi({
      enemy,
      rules: enemy.ai,
      enemyTurn: enemy.turnsTaken + 1,
      party: state.party,
      memory: enemy.aiMemory,
      rng: state.rng,
    });
    const rolls = rollAttack(decision.rng, 0);
    const core = attackCore({
      atkTotal: attackTotal({ atk: enemy.stats.atk, statMods: atkMods }),
      targetDef: attackTotal({ atk: unit.stats.def }),
      rolls: rolls.value,
      elementMult: elementMultiplier({ attacker: enemy.element, defender: unit.element }),
    });
    return hitDamage(core, 100);
  }

  it("inflicts an ailment on the party with one seeded roll per unit and a 3-turn duration", () => {
    const hex: EnemySkill = {
      id: "hex",
      name: "Hex",
      attacks: [],
      effects: [{ id: "ailment.inflict.weak", value: 50, turns: 1, target: "enemies" }],
    };
    const enemy: EnemySetup = {
      ...makeEnemy("witch"),
      skills: [hex],
      ai: [{ when: "default", skill: "hex", target: "random" }],
    };
    const start = createBattle({ ...makeSetup(4), waves: [[enemy]] }, 11);
    const foe = start.enemies[0];
    if (!foe) throw new Error("setup");

    // Replay: AI target draw, then one [0, 99] draw per living unit in party order.
    const decision = evaluateEnemyAi({
      enemy: foe,
      rules: foe.ai,
      enemyTurn: 1,
      party: start.party,
      memory: foe.aiMemory,
      rng: start.rng,
    });
    let rng = decision.rng;
    const struck: string[] = [];
    for (const unit of start.party) {
      const draw = nextInt(rng, 0, 99);
      rng = draw.rng;
      if (draw.value < 50) struck.push(unit.slot);
    }
    expect(struck.length).toBeGreaterThan(0);
    expect(struck.length).toBeLessThan(start.party.length);

    const { state, events } = endTurn(start);
    expect(ofType(events, "EnemyActionStarted")[0]).toMatchObject({ skill: "hex", hits: 0 });
    const applied = ofType(events, "EnemyEffectApplied");
    expect(applied.map((e) => e.target)).toEqual(struck);
    expect(applied.every((e) => e.actor === "e0" && e.tick === 0)).toBe(true);
    // Stored for 3 turns (data `turns` ignored), then the end-of-turn tick leaves 2.
    for (const unit of state.party) {
      const weak = unit.effects.find((e) => e.id === "ailment.inflict.weak");
      if (struck.includes(unit.slot)) {
        expect(weak).toMatchObject({ turns: 2, source: "bb" });
      } else {
        expect(weak).toBeUndefined();
      }
    }
    // The same seed gives the same log.
    expect(endTurn(createBattle({ ...makeSetup(4), waves: [[enemy]] }, 11)).events).toEqual(events);
  });

  it("applies an enemy self-buff that raises its later damage and expires on schedule", () => {
    const rage: EnemySkill = {
      id: "rage",
      name: "Rage",
      attacks: [],
      effects: [{ id: "buff.atk", value: 1, turns: 2, target: "self" }],
    };
    const enemy: EnemySetup = {
      ...makeEnemy("brute"),
      skills: [rage],
      ai: [
        { when: "hp_threshold_once", hpPercent: 90, skill: "rage", target: "random" },
        { when: "default", skill: "normal", target: "random" },
      ],
    };
    const start = duel(enemy);
    const turn1 = endTurn({ ...start, enemies: start.enemies.map((e) => ({ ...e, hp: 9000 })) });
    expect(ofType(turn1.events, "EnemyActionStarted")[0]).toMatchObject({
      skill: "rage",
      hits: 0,
    });
    expect(ofType(turn1.events, "EnemyEffectApplied")).toEqual([
      {
        type: "EnemyEffectApplied",
        tick: 0,
        actor: "e0",
        target: "e0",
        effect: { id: "buff.atk", value: 1, turns: 2, target: "self" },
      },
    ]);
    expect(turn1.state.enemies[0]?.effects.map((e) => [e.id, e.turns])).toEqual([["buff.atk", 1]]);

    // Turn 2: the normal attack uses ATK +100%; the buff then expires.
    const buffedDamage = expectedNormalHit(turn1.state, 1);
    const turn2 = endTurn(turn1.state);
    expect(ofType(turn2.events, "EnemyHitLanded")[0]?.damage).toBe(buffedDamage);
    expect(buffedDamage).toBeGreaterThan(expectedNormalHit(turn1.state, 0));
    expect(turn2.state.enemies[0]?.effects).toEqual([]);

    // Turn 3: back to base ATK.
    const turn3 = endTurn(turn2.state);
    expect(ofType(turn3.events, "EnemyHitLanded")[0]?.damage).toBe(
      expectedNormalHit(turn2.state, 0),
    );
  });

  it("heals its own side with heal.instant using the enemy's REC", () => {
    const mend: EnemySkill = {
      id: "mend",
      name: "Mend",
      attacks: [],
      effects: [{ id: "heal.instant", value: 1000, target: "party" }],
    };
    const enemy: EnemySetup = {
      ...makeEnemy("priest"),
      skills: [mend],
      ai: [{ when: "default", skill: "mend", target: "random" }],
    };
    const start = createBattle({ ...makeSetup(1), waves: [[enemy, makeEnemy("slime")]] }, 4);
    const hurt = { ...start, enemies: start.enemies.map((e) => ({ ...e, hp: 5000 })) };
    const { events } = endTurn(hurt);
    const heals = ofType(events, "HpRestored").filter((e) => e.effect === "heal.instant");
    // 1000 base + target REC 100 (the healer REC bonus is 0).
    expect(heals.map((e) => [e.actor, e.target, e.amount, e.hp])).toEqual([
      ["e0", "e0", 1100, 6100],
      ["e0", "e1", 1100, 6100],
    ]);
  });

  it("heals itself over time at the end-of-turn tick (M6-01B_2)", () => {
    const vigil: EnemySkill = {
      id: "vigil",
      name: "Vigil",
      attacks: [],
      effects: [{ id: "heal.over_time", value: 800, turns: 2, target: "self" }],
    };
    const enemy: EnemySetup = {
      ...makeEnemy("hermit"),
      skills: [vigil],
      ai: [
        { when: "on_turn", turn: 1, skill: "vigil", target: "random" },
        { when: "default", skill: "normal", target: "random" },
      ],
    };
    const start = createBattle({ ...makeSetup(1), waves: [[enemy]] }, 4);
    let state: BattleState = { ...start, enemies: start.enemies.map((e) => ({ ...e, hp: 5000 })) };
    const amounts: number[] = [];
    for (let turn = 0; turn < 3; turn++) {
      const result = endTurn(state);
      const heals = ofType(result.events, "HpRestored").filter(
        (e) => e.effect === "heal.over_time" && e.target === "e0",
      );
      amounts.push(...heals.map((e) => e.amount));
      state = result.state;
    }
    // 800 per tick for its 2 turns (no REC bonus), then it ends.
    expect(amounts).toEqual([800, 800]);
    expect(state.enemies[0]?.effects.some((e) => e.id === "heal.over_time")).toBe(false);
  });
});
