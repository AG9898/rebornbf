import type { Attack, Unit } from "@bfr/data";
import {
  type BattleInput,
  type BattleSetup,
  type BattleState,
  createBattle,
  type EnemySetup,
} from "@bfr/engine";
import { TEST_ATTACK_TIMING, TEST_UNIT_SHEET } from "../assets/sprites.ts";
import type { BattleSpec } from "./battle-scene.ts";

/**
 * The placeholder two-wave battle the battle route plays until quests exist. Its content is
 * chosen to show every playback style: two units with identical normal attacks tapped on the
 * same tick spark every hit, and a burst with two same-frame attacks self-sparks and (with a 100%
 * self crit buff) crits. All outcomes are the engine's.
 */

/**
 * Every unit's normal attack. Its start delay and hit frames come from the test sprite sheet's
 * `attack`/`hit` tags (M2-03): 20 ticks of lead, then hits at +0, +10, +20.
 */
const TAP: Attack = {
  moveType: "melee",
  ...TEST_ATTACK_TIMING,
  damageDistribution: [30, 30, 40],
  dropChecks: 6,
};

const TWIN_STRIKE: Attack = {
  moveType: "melee",
  startDelayFrames: 24,
  hitFrames: [0, 8, 16, 24],
  damageDistribution: [25, 25, 25, 25],
  dropChecks: 8,
};

function testUnit(id: string, name: string, bbCost: number, bbAttacks: Attack[]): Unit {
  const stats = { hp: 4000, atk: 1400, def: 1100, rec: 900 };
  return {
    id,
    name,
    element: "fire",
    source: { placeholder: true },
    forms: [
      {
        id: `${id}-5`,
        name,
        rarity: 5,
        maxLevel: 80,
        stats: { base: { hp: 1500, atk: 500, def: 400, rec: 300 }, max: stats },
        normalAttack: TAP,
        bursts: {
          bb: {
            name: `${name} Burst`,
            cost: bbCost,
            attacks: bbAttacks,
            effects: [
              ...bbAttacks.map(() => ({
                id: "attack.st" as const,
                value: 0,
                target: "enemy" as const,
              })),
              { id: "buff.crit_rate", value: 1, turns: 1, target: "self" },
            ],
          },
        },
        sphereSlots: 1,
      },
    ],
  };
}

/**
 * The party wears the five locked units' 6★ idle sprites (M2-03C); the kits are placeholders, not
 * those units' transcribed kits.
 */
const UNITS: readonly Unit[] = [
  testUnit("test-brand", "Brand", 20, [TAP]),
  testUnit("test-maren", "Maren", 20, [TAP]),
  testUnit("test-rook", "Rook", 10, [TWIN_STRIKE, TWIN_STRIKE]),
  testUnit("test-garrick", "Garrick", 20, [TAP]),
  testUnit("test-solen", "Solen", 20, [TAP]),
];

/**
 * Art for each party slot, in party order: the `art/legacy/units/<id>` export whose 6★ idle sprite draws
 * the unit. Brand is drawn from the test sheet (built from his 6★ idle), so he also animates.
 */
export const TEST_PARTY_ART: readonly string[] = ["brand", "maren", "rook", "garrick", "solen"];

const ENEMY_STATS = { atk: 800, def: 500, rec: 100 };
const ENEMY_KIT: Pick<EnemySetup, "normalAttack" | "skills" | "ai"> = {
  normalAttack: {
    moveType: "melee",
    startDelayFrames: 20,
    hitFrames: [0],
    damageDistribution: [100],
    dropChecks: 0,
  },
  skills: [],
  ai: [{ when: "default", skill: "normal", target: "random" }],
};
function testEnemy(id: string, name: string, hp: number): EnemySetup {
  return { id, name, element: "earth", stats: { hp, ...ENEMY_STATS }, ...ENEMY_KIT };
}

/** Two waves: a slime and a golem, then two slimes. */
const WAVES: readonly (readonly EnemySetup[])[] = [
  [testEnemy("test-slime", "Slime", 3000), testEnemy("test-golem", "Golem", 30000)],
  [testEnemy("test-slime", "Slime", 3000), testEnemy("test-slime", "Slime", 3000)],
];

export const TEST_BATTLE_SETUP: BattleSetup = {
  squad: UNITS.map((unit) => ({
    unit,
    formId: `${unit.id}-5`,
    stats: unit.forms[0]?.stats.max ?? { hp: 1, atk: 1, def: 1, rec: 1 },
  })),
  leaderIndex: 0,
  waves: WAVES,
};

export interface TestBattleOptions {
  /**
   * Start every unit with its BB cost in its gauge, so a burst is possible on the first turn (the
   * scripted opening in `SCRIPTED_INPUTS` needs it). The battle route starts with empty gauges.
   */
  readonly charged?: boolean;
}

/** Creates the test battle. */
export function createTestBattle(seed: number, options: TestBattleOptions = {}): BattleState {
  const state = createBattle(TEST_BATTLE_SETUP, seed);
  if (!options.charged) return state;
  return {
    ...state,
    party: state.party.map((unit) => ({ ...unit, bc: unit.form.bursts.bb.cost })),
  };
}

/** The test battle as the battle scene plays it: Brand animates from the M2-03 test sheet. */
export const TEST_BATTLE_SPEC: BattleSpec = {
  title: "TEST BATTLE",
  create: (seed) => createTestBattle(seed),
  partyArt: TEST_PARTY_ART,
  sheet: { art: "brand", sheet: TEST_UNIT_SHEET },
};

/**
 * A scripted opening for a charged test battle (ticks at 60/s): Brand and Maren tap together
 * (their hits spark), then Rook bursts (self-sparks and crits). Garrick and Solen are left
 * unacted. Used by tests.
 */
export const SCRIPTED_INPUTS: readonly BattleInput[] = [
  { type: "attack", tick: 45, actor: "p0" },
  { type: "attack", tick: 45, actor: "p1" },
  { type: "burst", tick: 150, actor: "p2", tier: "bb" },
];
