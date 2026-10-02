import { type AiRule, AiRuleSchema } from "@bfr/data";
import { describe, expect, it } from "vitest";
import { createRng, nextInt } from "../rng.ts";
import { createBattle } from "../state/create-battle.ts";
import type { BattleEnemy, BattleUnit } from "../state/types.ts";
import { makeSetup } from "../test/factories.ts";
import {
  aiConditionHolds,
  chooseAiTarget,
  createAiMemory,
  type EnemyAiMemory,
  evaluateEnemyAi,
  everyNTurnsFires,
  hpAtOrBelow,
} from "./evaluate.ts";

const battle = createBattle(makeSetup(5), 7);
const enemy = battle.enemies[0] as BattleEnemy;
const party = battle.party;

/** Every-3rd-turn roar, a 50% HP smash once, else a random normal attack. */
const SCRIPT: AiRule[] = AiRuleSchema.array().parse([
  { when: "every_n_turns", n: 3, skill: "roar", target: "random" },
  { when: "hp_threshold_once", hpPercent: 50, skill: "smash", target: "lowest_hp" },
  { when: "default", skill: "normal", target: "random" },
]);

function withHp<T extends BattleEnemy | BattleUnit>(combatant: T, hp: number): T {
  return { ...combatant, hp };
}

/** Runs `hpByTurn.length` enemy turns, returning the chosen skill per turn. */
function runTurns(rules: readonly AiRule[], hpByTurn: readonly number[]): string[] {
  let memory: EnemyAiMemory = createAiMemory();
  let rng = createRng(11);
  return hpByTurn.map((hp, i) => {
    const decision = evaluateEnemyAi({
      enemy: withHp(enemy, hp),
      rules,
      enemyTurn: i + 1,
      party,
      memory,
      rng,
    });
    memory = decision.memory;
    rng = decision.rng;
    return decision.skill;
  });
}

describe("trigger helpers", () => {
  it("every_n_turns fires on offset + n, offset + 2n, …", () => {
    const fired = (n: number, offset?: number) =>
      [1, 2, 3, 4, 5, 6, 7].filter((t) => everyNTurnsFires(t, n, offset));
    expect(fired(3)).toEqual([3, 6]);
    expect(fired(1)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(fired(3, 1)).toEqual([4, 7]);
    expect(fired(2, 4)).toEqual([6]);
  });

  it("HP threshold is inclusive against max HP", () => {
    expect(hpAtOrBelow(withHp(enemy, 5000), 50)).toBe(true);
    expect(hpAtOrBelow(withHp(enemy, 5001), 50)).toBe(false);
    expect(hpAtOrBelow(withHp(enemy, 2500), 25)).toBe(true);
  });

  it("conditions read living party units' active effects", () => {
    const buffed = party.map((unit, i) =>
      i === 2
        ? {
            ...unit,
            effects: [
              {
                id: "mitigation" as const,
                value: 0.5,
                turns: 2,
                target: "party" as const,
                source: "bb" as const,
              },
            ],
          }
        : unit,
    );
    const lacks = { type: "party_lacks_effect", effect: "mitigation" } as const;
    const has = { type: "party_has_effect", effect: "mitigation" } as const;
    expect(aiConditionHolds(lacks, party)).toBe(true);
    expect(aiConditionHolds(has, party)).toBe(false);
    expect(aiConditionHolds(lacks, buffed)).toBe(false);
    expect(aiConditionHolds(has, buffed)).toBe(true);
    const koBuffed = buffed.map((unit, i) => (i === 2 ? withHp(unit, 0) : unit));
    expect(aiConditionHolds(has, koBuffed)).toBe(false);
  });
});

describe("evaluateEnemyAi", () => {
  it("fires the 50% HP skill exactly once", () => {
    const max = enemy.stats.hp;
    expect(runTurns(SCRIPT, [max, max * 0.6, max * 0.5, max * 0.4, max * 0.3, max * 0.2])).toEqual([
      "normal",
      "normal",
      "roar",
      "smash",
      "normal",
      "roar",
    ]);
    expect(runTurns(SCRIPT, [max * 0.4, max * 0.4, max * 0.4, max * 0.1])).toEqual([
      "smash",
      "normal",
      "roar",
      "normal",
    ]);
  });

  it("on_turn fires only on its own enemy turn (M6-01B_2)", () => {
    const opener: AiRule[] = AiRuleSchema.array().parse([
      { when: "on_turn", turn: 1, skill: "verdict", target: "random" },
      { when: "on_turn", turn: 4, skill: "lesson", target: "random" },
      { when: "default", skill: "normal", target: "random" },
    ]);
    const full = enemy.stats.hp;
    expect(runTurns(opener, [full, full, full, full, full])).toEqual([
      "verdict",
      "normal",
      "normal",
      "lesson",
      "normal",
    ]);
    expect(() =>
      AiRuleSchema.parse({ when: "on_turn", turn: 0, skill: "x", target: "random" }),
    ).toThrow();
  });

  it("records only fired threshold rules in memory", () => {
    const low = withHp(enemy, 1000);
    const ctx = { enemy: low, rules: SCRIPT, party, memory: createAiMemory(), rng: createRng(1) };
    const onRoarTurn = evaluateEnemyAi({ ...ctx, enemyTurn: 3 });
    expect(onRoarTurn).toMatchObject({ skill: "roar", ruleIndex: 0, memory: { firedOnce: [] } });
    const next = evaluateEnemyAi({ ...ctx, enemyTurn: 4, memory: onRoarTurn.memory });
    expect(next).toMatchObject({ skill: "smash", ruleIndex: 1, memory: { firedOnce: [1] } });
  });

  it("condition rules fire whenever they hold", () => {
    const rules = AiRuleSchema.array().parse([
      {
        when: "condition",
        condition: { type: "party_lacks_effect", effect: "mitigation" },
        skill: "nuke",
        target: "random",
      },
      { when: "default", skill: "normal", target: "random" },
    ]);
    expect(runTurns(rules, [100, 100, 100])).toEqual(["nuke", "nuke", "nuke"]);
  });

  it("random targets are deterministic under a seed and draw one integer over living units", () => {
    const decide = (seed: number, units: readonly BattleUnit[] = party) =>
      evaluateEnemyAi({
        enemy,
        rules: SCRIPT,
        enemyTurn: 1,
        party: units,
        memory: createAiMemory(),
        rng: createRng(seed),
      });
    expect(decide(42)).toEqual(decide(42));
    const draw = nextInt(createRng(42), 0, party.length - 1);
    expect(decide(42)).toMatchObject({ target: party[draw.value]?.slot, rng: draw.rng });
    // KO'd units are never targeted.
    const ko = party.map((unit, i) => (i % 2 === 0 ? withHp(unit, 0) : unit));
    const living = ko.filter((unit) => unit.hp > 0).map((unit) => unit.slot);
    for (let seed = 0; seed < 50; seed++) {
      expect(living).toContain(decide(seed, ko).target);
    }
    const seen = new Set(Array.from({ length: 50 }, (_, seed) => decide(seed).target));
    expect(seen.size).toBe(party.length);
  });

  it("lowest_hp targets the lowest current HP without drawing", () => {
    const hurt = party.map((unit, i) =>
      i === 3 ? withHp(unit, 10) : i === 1 ? withHp(unit, 10) : unit,
    );
    const rng = createRng(5);
    expect(chooseAiTarget("lowest_hp", hurt, rng)).toEqual({ target: hurt[1]?.slot, rng });
  });

  it("has no target and no draw when the party is wiped", () => {
    const wiped = party.map((unit) => withHp(unit, 0));
    const rng = createRng(3);
    const decision = evaluateEnemyAi({
      enemy,
      rules: SCRIPT,
      enemyTurn: 1,
      party: wiped,
      memory: createAiMemory(),
      rng,
    });
    expect(decision.target).toBeUndefined();
    expect(decision.rng).toBe(rng);
  });

  it("rejects defeated enemies and bad turn numbers", () => {
    const base = { rules: SCRIPT, party, memory: createAiMemory(), rng: createRng(1) };
    expect(() => evaluateEnemyAi({ ...base, enemy: withHp(enemy, 0), enemyTurn: 1 })).toThrow(
      RangeError,
    );
    expect(() => evaluateEnemyAi({ ...base, enemy, enemyTurn: 0 })).toThrow(RangeError);
  });

  it("memory and decisions survive a JSON round-trip", () => {
    const max = enemy.stats.hp;
    const first = evaluateEnemyAi({
      enemy: withHp(enemy, max / 2),
      rules: SCRIPT,
      enemyTurn: 1,
      party,
      memory: createAiMemory(),
      rng: createRng(9),
    });
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });
});
