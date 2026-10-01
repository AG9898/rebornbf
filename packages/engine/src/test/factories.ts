import type { Attack, Effect, Stats, Unit } from "@bfr/data";
import type { BattleSetup, EnemySetup, ResolvedStatsMember } from "../state/types.ts";

const STATS: Stats = { hp: 4000, atk: 1400, def: 1100, rec: 900 };

/** `count` single-target attack shapes with BB modifier `modifier`, one per burst attack. */
export function singleTargetShapes(count: number, modifier = 0): Effect[] {
  return Array.from({ length: count }, () => ({
    id: "attack.st",
    value: modifier,
    target: "enemy",
  }));
}

/** A minimal valid placeholder unit with one form `<id>-5` and a leader skill. */
export function makeUnit(id: string, overrides: Partial<Unit> = {}): Unit {
  return {
    id,
    name: `Test ${id}`,
    element: "fire",
    source: { placeholder: true },
    forms: [
      {
        id: `${id}-5`,
        name: `Test ${id}`,
        rarity: 5,
        maxLevel: 80,
        stats: { base: { hp: 1500, atk: 500, def: 400, rec: 300 }, max: STATS },
        normalAttack: {
          moveType: "melee",
          startDelayFrames: 20,
          hitFrames: [0, 10],
          damageDistribution: [50, 50],
          dropChecks: 4,
        },
        bursts: {
          bb: {
            name: `Test ${id} Burst`,
            cost: 20,
            attacks: [],
            effects: [{ id: "buff.atk", value: 0.5, turns: 3, target: "party" }],
          },
        },
        leaderSkill: {
          name: `Test ${id} Lead`,
          effects: [{ id: "passive.exp_gain", value: 0.3, target: "party" }],
        },
        sphereSlots: 1,
      },
    ],
    ...overrides,
  };
}

export function makeMember(id: string): ResolvedStatsMember {
  return { unit: makeUnit(id), formId: `${id}-5`, stats: STATS };
}

/** A one-hit enemy normal attack (no drop checks: enemies' attacks drop nothing). */
export const ENEMY_NORMAL_ATTACK: Attack = {
  moveType: "melee",
  startDelayFrames: 20,
  hitFrames: [0],
  damageDistribution: [100],
  dropChecks: 0,
};

/** An enemy that always normal-attacks a random party unit. */
export function makeEnemy(id: string): EnemySetup {
  return {
    id,
    name: `Test ${id}`,
    element: "earth",
    stats: { hp: 10000, atk: 800, def: 500, rec: 100 },
    normalAttack: ENEMY_NORMAL_ATTACK,
    skills: [],
    ai: [{ when: "default", skill: "normal", target: "random" }],
  };
}

/** A setup with `count` squad units (leader first), no ally, and two waves. */
export function makeSetup(count = 5): BattleSetup {
  return {
    squad: Array.from({ length: count }, (_, i) => makeMember(`unit-${i}`)),
    leaderIndex: 0,
    waves: [[makeEnemy("slime"), makeEnemy("slime")], [makeEnemy("boss")]],
  };
}
