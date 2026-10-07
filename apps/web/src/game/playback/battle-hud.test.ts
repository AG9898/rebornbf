import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type Enemy, EnemySchema, type Stage, StageSchema, type Unit, UnitSchema } from "@bfr/data";
import story01 from "@bfr/data/content/stages/story-01-brightmere-outskirts.json";
import {
  type ActiveEffect,
  type BattleInput,
  type BattleState,
  canBurst,
  createBattle,
  isPassiveSource,
  playTurn,
} from "@bfr/engine";
import { describe, expect, it } from "vitest";
import { stageBackground } from "../assets/stage-art.ts";
import { applyHudEvents, initHud } from "../hud/model.ts";
import { toCues } from "./cues.ts";

// HUD badges and weakness arrows over a real stage: chapter 1's boss stage, fought by the six B0
// starters at Omni (Brand leading, Morrick as the guest ally).

const CONTENT = join(import.meta.dirname, "../../../../../packages/data/content");

function load(path: string): unknown {
  return JSON.parse(readFileSync(join(CONTENT, path), "utf8"));
}

const STAGE: Stage = StageSchema.parse(load("stages/story-08-beacon-hollow.json"));

function enemy(id: string) {
  const { drops, ...rest }: Enemy = EnemySchema.parse(load(`enemies/${id}.json`));
  return drops.bcResistance === undefined ? rest : { ...rest, bcResistance: drops.bcResistance };
}

function omni(id: string) {
  const unit: Unit = UnitSchema.parse(load(`units/${id}.json`));
  const form = unit.forms.find((f) => f.id === `${id}-omni`);
  if (!form) throw new Error(`${id}-omni is missing`);
  return { unit, formId: form.id, stats: form.stats.max };
}

function createStageBattle(seed: number): BattleState {
  return createBattle(
    {
      squad: ["brand", "maren", "garrick", "rook", "solen"].map(omni),
      leaderIndex: 0,
      ally: { ...omni("morrick"), kind: "guest" },
      waves: STAGE.waves.map((wave) => wave.enemies.map((slot) => enemy(slot.enemy))),
    },
    seed,
  );
}

describe("stage backgrounds", () => {
  it("uses the plains background for chapter 1", () => {
    expect(stageBackground(StageSchema.parse(story01))).toBe("plains");
  });

  // Farming-dungeon stages get the chapter 1 dungeon background and their sprites in M6-07M
  // (RESOLVED-72); until then they have no battle art and are skipped here.
  it("resolves a background for every bundled non-dungeon stage", () => {
    for (const file of readdirSync(join(CONTENT, "stages")).filter((n) => n.endsWith(".json"))) {
      const stage = StageSchema.parse(load(`stages/${file}`));
      if (stage.dungeon) continue;
      // Trials share the trial hall and chapter 2 is on the coast; everything else is on the plains.
      const expected = stage.trial
        ? "trial-hall"
        : stage.story?.chapter === 2
          ? "saltglass-coast"
          : "plains";
      expect(stageBackground(stage), file).toBe(expected);
    }
  });
});

/** Every living unit uses its highest charged burst, else attacks (as the engine's stage test). */
function autoInputs(state: BattleState): BattleInput[] {
  return state.party
    .filter((unit) => unit.hp > 0)
    .map((unit): BattleInput => {
      const tier = (["sbb", "bb"] as const).find((t) =>
        canBurst(unit.form, t, unit.bc, unit.overdrive),
      );
      return tier
        ? { type: "burst", tick: state.tick, actor: unit.slot, tier }
        : { type: "attack", tick: state.tick, actor: unit.slot };
    });
}

/** A combatant's active burst/skill effect IDs, as a sorted list. */
function activeIds(effects: readonly ActiveEffect[]): string[] {
  return [...new Set(effects.filter((e) => !isPassiveSource(e.source)).map((e) => e.id))].sort();
}

describe("status badges in a stage battle (M2-07B)", () => {
  it("track apply and expiry events: the HUD's effect IDs match the engine after every turn", () => {
    let state = createStageBattle(3);
    let hud = initHud(state);
    let applied = 0;
    let ended = 0;
    for (let turn = 0; turn < 40 && state.result === undefined; turn++) {
      const result = playTurn(state, autoInputs(state));
      applied += result.events.filter((e) => e.type.endsWith("EffectApplied")).length;
      ended += result.events.filter((e) => e.type === "EffectEnded").length;
      hud = applyHudEvents(hud, result.events);
      state = result.state;
      if (state.result !== undefined) break;
      expect(hud.units.map((u) => [...u.effects].sort())).toEqual(
        state.party.map((u) => activeIds(u.effects)),
      );
      expect(hud.enemies.map((e) => [...e.effects].sort())).toEqual(
        state.enemies.map((e) => activeIds(e.effects)),
      );
    }
    expect(applied).toBeGreaterThan(0);
    expect(ended).toBeGreaterThan(0);
  });
});

describe("weakness arrows in a stage battle", () => {
  it("draws weak arrows on the first turn's hits from the events' element relation", () => {
    const state = createStageBattle(3);
    const { events } = playTurn(state, autoInputs(state));
    const arrows = toCues(events).flatMap((cue) =>
      (cue.kind === "damage" || cue.kind === "unit-damage") && cue.arrow ? [cue.arrow] : [],
    );
    expect(arrows).toContain("icon-weak");
  });
});
