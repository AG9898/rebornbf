import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { StageSchema } from "@bfr/data";
import story01 from "@bfr/data/content/stages/story-01-brightmere-outskirts.json";
import {
  type ActiveEffect,
  type BattleInput,
  type BattleState,
  canBurst,
  isPassiveSource,
  playTurn,
} from "@bfr/engine";
import { describe, expect, it } from "vitest";
import { stageBackground, stageEnemyArt } from "../assets/stage-art.ts";
import { applyHudEvents, initHud } from "../hud/model.ts";
import { toCues } from "./cues.ts";
import { createDemoBattle, DEMO_BATTLE_SPEC, DEMO_PARTY_ART, DEMO_STAGE } from "./demo-battle.ts";

describe("demo battle (M2-05B)", () => {
  it("uses the plains background for the demo and chapter 1, with wave enemy art", () => {
    expect(stageBackground(DEMO_STAGE)).toBe("plains");
    expect(stageBackground(StageSchema.parse(story01))).toBe("plains");
    expect(DEMO_BATTLE_SPEC.enemyWaves).toEqual(stageEnemyArt(DEMO_STAGE));
    expect(DEMO_BATTLE_SPEC.enemyWaves?.[2]).toEqual([{ id: "demo-ashen-warden", size: 256 }]);
  });

  // Farming-dungeon stages get the chapter 1 dungeon background and their sprites in M6-07M
  // (RESOLVED-72); until then they have no battle art and are skipped here.
  it("resolves a background for every bundled non-dungeon stage", () => {
    const dir = join(import.meta.dirname, "../../../../../packages/data/content/stages");
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".json"))) {
      const stage = StageSchema.parse(JSON.parse(readFileSync(join(dir, file), "utf8")));
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
  it("fields the six B0 starters at Omni, Brand leading and Morrick as the guest ally", () => {
    const state = createDemoBattle(1);
    expect(state.party.map((unit) => [unit.slot, unit.unitId, unit.form.id])).toEqual([
      ["p0", "brand", "brand-omni"],
      ["p1", "maren", "maren-omni"],
      ["p2", "garrick", "garrick-omni"],
      ["p3", "rook", "rook-omni"],
      ["p4", "solen", "solen-omni"],
      ["ally", "morrick", "morrick-omni"],
    ]);
    // Each party slot wears its own unit's art.
    expect(DEMO_PARTY_ART).toEqual(state.party.map((unit) => unit.unitId));
  });

  it("opens on the demo stage's first wave with a HUD card per unit", () => {
    const state = DEMO_BATTLE_SPEC.create(7);
    expect(state.waveIndex).toBe(0);
    expect(state.enemies.map((enemy) => enemy.enemyId)).toEqual([
      "demo-thornling",
      "demo-thornling",
      "demo-rillwisp",
    ]);
    expect(initHud(state).units).toHaveLength(6);
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

describe("status badges in the demo battle (M2-07B)", () => {
  it("track apply and expiry events: the HUD's effect IDs match the engine after every turn", () => {
    let state = createDemoBattle(3);
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

describe("weakness arrows in the demo battle", () => {
  it("draws weak arrows on the first turn's hits from the events' element relation", () => {
    const state = createDemoBattle(3);
    const { events } = playTurn(state, autoInputs(state));
    const arrows = toCues(events).flatMap((cue) =>
      (cue.kind === "damage" || cue.kind === "unit-damage") && cue.arrow ? [cue.arrow] : [],
    );
    expect(arrows).toContain("icon-weak");
  });
});
