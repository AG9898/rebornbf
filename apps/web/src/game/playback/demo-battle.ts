import { type Enemy, EnemySchema, type Stage, StageSchema, type Unit, UnitSchema } from "@bfr/data";
import ashenWarden from "@bfr/data/content/enemies/demo-ashen-warden.json";
import rillwisp from "@bfr/data/content/enemies/demo-rillwisp.json";
import thornling from "@bfr/data/content/enemies/demo-thornling.json";
import demoStage from "@bfr/data/content/stages/demo-stage.json";
import brand from "@bfr/data/content/units/brand.json";
import garrick from "@bfr/data/content/units/garrick.json";
import maren from "@bfr/data/content/units/maren.json";
import morrick from "@bfr/data/content/units/morrick.json";
import rook from "@bfr/data/content/units/rook.json";
import solen from "@bfr/data/content/units/solen.json";
import {
  type BattleSetup,
  type BattleState,
  createBattle,
  type EnemySetup,
  type SquadMemberSetup,
} from "@bfr/engine";
import { stageBackground, stageEnemyArt } from "../assets/stage-art.ts";
import type { BattleSpec } from "./battle-scene.ts";
import { stageBossWaves } from "./cues.ts";
import { stageNames } from "./stage-names.ts";

/**
 * The offline demo battle (M2-05B): the demo stage (M2-05A, Ashen Pass) fought by the six B0
 * starters at Omni — five in the squad with Brand as Leader, Morrick as the guest ally. The same
 * setup clears the stage headlessly in `packages/engine/src/stages/demo-stage.test.ts`. No sign-in
 * and no rewards: nothing leaves the browser.
 */

export const DEMO_STAGE: Stage = StageSchema.parse(demoStage);

const ENEMIES: ReadonlyMap<string, Enemy> = new Map(
  [thornling, rillwisp, ashenWarden].map((json) => {
    const enemy = EnemySchema.parse(json);
    return [enemy.id, enemy];
  }),
);

const UNITS: ReadonlyMap<string, Unit> = new Map(
  [brand, maren, garrick, rook, solen, morrick].map((json) => {
    const unit = UnitSchema.parse(json);
    return [unit.id, unit];
  }),
);

/** Squad order (Leader first), then the ally. Also the art id of each party slot. */
const SQUAD = ["brand", "maren", "garrick", "rook", "solen"] as const;
const ALLY = "morrick";

/** Art for each party slot in party order: every unit wears its Omni idle sprite. */
export const DEMO_PARTY_ART: readonly string[] = [...SQUAD, ALLY];
export const DEMO_ART_FORM = "omni";

function enemySetup(id: string): EnemySetup {
  const enemy = ENEMIES.get(id);
  if (!enemy) throw new Error(`demo stage: enemy ${id} is not bundled`);
  const { drops, ...rest } = enemy;
  return drops.bcResistance === undefined ? rest : { ...rest, bcResistance: drops.bcResistance };
}

function omni(id: string): SquadMemberSetup {
  const unit = UNITS.get(id);
  const form = unit?.forms.find((f) => f.id === `${id}-omni`);
  if (!unit || !form) throw new Error(`demo battle: ${id}-omni is not bundled`);
  return { unit, formId: form.id, stats: form.stats.max };
}

export const DEMO_BATTLE_SETUP: BattleSetup = {
  squad: SQUAD.map(omni),
  leaderIndex: 0,
  ally: { ...omni(ALLY), kind: "guest" },
  waves: DEMO_STAGE.waves.map((wave) => wave.enemies.map((slot) => enemySetup(slot.enemy))),
};

/** Creates the demo battle. */
export function createDemoBattle(seed: number): BattleState {
  return createBattle(DEMO_BATTLE_SETUP, seed);
}

/** The demo battle as the battle scene plays it. */
export const DEMO_BATTLE_SPEC: BattleSpec = {
  title: `DEMO  ${DEMO_STAGE.name.toUpperCase()}`,
  create: createDemoBattle,
  partyArt: DEMO_PARTY_ART,
  artForm: DEMO_ART_FORM,
  bossWaves: stageBossWaves(DEMO_STAGE),
  names: stageNames(DEMO_STAGE),
  background: stageBackground(DEMO_STAGE),
  enemyWaves: stageEnemyArt(DEMO_STAGE),
};
