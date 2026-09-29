import type { Enemy, Stage, TutorialStep, Unit } from "@bfr/data";
import type {
  BattleSetup,
  EnemySetup,
  EnemySlotId,
  PlayerSlotId,
  SquadMemberSetup,
} from "../state/types.ts";
import type { BattleInput } from "../timeline/types.ts";

// The tutorial battle (GAME_DESIGN §8 → New player flow, RESOLVED-68): turns a stage's `tutorial`
// block into a battle setup and each script step into engine inputs. The client plays it with no
// battle session or replay, since it grants nothing.

/** An enemy's battle setup: its content minus the drop table, keeping the BC resistance. */
function enemySetup(enemy: Enemy): EnemySetup {
  const { drops, ...rest } = enemy;
  return drops.bcResistance === undefined ? rest : { ...rest, bcResistance: drops.bcResistance };
}

/**
 * The tutorial's battle setup: the preset units (leader first) and ally in their tutorial-rarity
 * form at the tutorial level with no type gains, against the stage's waves. `units` and `enemies`
 * look content up by ID; a missing unit, form, or enemy throws.
 */
export function tutorialSetup(
  stage: Stage,
  units: (id: string) => Unit | undefined,
  enemies: (id: string) => Enemy | undefined,
): BattleSetup {
  const tutorial = stage.tutorial;
  if (!tutorial) throw new Error(`stage "${stage.id}" is not a tutorial`);
  const member = (id: string): SquadMemberSetup => {
    const unit = units(id);
    const form = unit?.forms.find((f) => f.rarity === tutorial.rarity);
    if (!unit || !form) throw new Error(`tutorial unit "${id}" has no ${tutorial.rarity}★ form`);
    return { unit, formId: form.id, level: tutorial.level };
  };
  const enemy = (id: string): EnemySetup => {
    const content = enemies(id);
    if (!content) throw new Error(`tutorial enemy "${id}" missing`);
    return enemySetup(content);
  };
  return {
    squad: tutorial.units.map(member),
    leaderIndex: 0,
    ...(tutorial.ally ? { ally: { ...member(tutorial.ally), kind: "guest" as const } } : {}),
    waves: stage.waves.map((wave) => wave.enemies.map((slot) => enemy(slot.enemy))),
  };
}

/** A script step's inputs for the turn that starts at `tick` (each input at `tick + delay`). */
export function tutorialInputs(step: TutorialStep, tick: number): BattleInput[] {
  return step.inputs.map((input): BattleInput => {
    const actor = input.actor as PlayerSlotId;
    const at = tick + input.delay;
    if (input.type === "guard") return { type: "guard", tick: at, actor };
    const target = input.target ? { target: input.target as EnemySlotId } : {};
    return input.type === "attack"
      ? { type: "attack", tick: at, actor, ...target }
      : { type: "burst", tick: at, actor, tier: input.tier, ...target };
  });
}
