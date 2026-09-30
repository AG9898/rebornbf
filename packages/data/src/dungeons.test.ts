import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHAPTER_1_CLEAR,
  CHAPTER_1_DUNGEON_MOBS,
  crownShardStage,
  DUNGEON_CAPTURE_RATE,
  DUNGEON_FAMILIES,
  type DungeonFamily,
  dungeonStage,
  familyElements,
  materialEnemy,
  materialUnitId,
} from "./dungeons.ts";
import { ELEMENTS } from "./schemas/common.ts";
import { EnemySchema } from "./schemas/enemy.ts";
import { StageSchema } from "./schemas/stage.ts";

// Farming-dungeon templates (M4-03C–F): every templated stage and material enemy file in content/
// is exactly what its family's template builds (rewrite them with `pnpm --filter @bfr/data
// dungeons`), and every series gates on its story stage.

const content = join(import.meta.dirname, "..", "content");

function load(path: string): unknown {
  return JSON.parse(readFileSync(join(content, path), "utf8"));
}

const families: readonly DungeonFamily[] = Object.values(DUNGEON_FAMILIES);

describe("dungeon templates (M4-03C–F)", () => {
  it.each(families)("the $title series has one templated stage per element", (family) => {
    expect(familyElements(family)).toEqual(family.single ? [family.single] : ELEMENTS);
    for (const element of familyElements(family)) {
      const stage = dungeonStage(family, element);
      expect(StageSchema.parse(load(`stages/${stage.id}.json`))).toEqual(stage);
      const enemy = materialEnemy(family, element);
      expect(EnemySchema.parse(load(`enemies/${enemy.id}.json`))).toEqual(enemy);
      expect(enemy.element).toBe(element);
      expect(readdirSync(join(content, "units"))).toContain(
        `${materialUnitId(family, element)}.json`,
      );
    }
  });

  it("every dungeon stage in content comes from a template", () => {
    const templated = new Set([
      ...families.flatMap((family) =>
        familyElements(family).map((element) => dungeonStage(family, element).id),
      ),
      crownShardStage().id,
    ]);
    const dungeons = readdirSync(join(content, "stages"))
      .map((name) => StageSchema.parse(load(`stages/${name}`)))
      .filter((stage) => stage.dungeon !== undefined)
      .map((stage) => stage.id);
    expect(new Set(dungeons)).toEqual(templated);
  });

  it("the Sprite and Effigy series open on the story stage 4 first clear", () => {
    const gate = StageSchema.parse(load(`stages/${DUNGEON_FAMILIES.sprite.gate}.json`));
    expect(gate.story?.number).toBe(4);
    expect(DUNGEON_FAMILIES.effigy.gate).toBe(gate.id);
    expect(DUNGEON_FAMILIES.sprite.ramp).toBe(0);
    expect(DUNGEON_FAMILIES.effigy.ramp).toBe(0);
  });

  it("the Mote and Cairn series open on the story stage 6 first clear with a 10% ramp", () => {
    const gate = StageSchema.parse(load(`stages/${DUNGEON_FAMILIES.mote.gate}.json`));
    expect(gate.story?.number).toBe(6);
    expect(DUNGEON_FAMILIES.cairn.gate).toBe(gate.id);
    for (const family of [DUNGEON_FAMILIES.mote, DUNGEON_FAMILIES.cairn]) {
      for (const element of ELEMENTS) {
        expect(dungeonStage(family, element).dungeon?.ramp).toBe(10);
      }
    }
  });

  it("the chapter 1 clear series open on story stage 8 with their 25% and 45% ramps", () => {
    const gate = StageSchema.parse(load(`stages/${CHAPTER_1_CLEAR}.json`));
    expect(gate.story?.number).toBe(8);
    const ramps = {
      "prism-cairn": 25,
      "wyrm-coffer": 25,
      colossus: 45,
      "glint-urn": 45,
      "dusk-urn": 45,
    } as const;
    for (const [id, ramp] of Object.entries(ramps)) {
      const family = DUNGEON_FAMILIES[id as keyof typeof ramps];
      expect(family.gate).toBe(CHAPTER_1_CLEAR);
      for (const element of familyElements(family)) {
        expect(dungeonStage(family, element).dungeon?.ramp).toBe(ramp);
      }
    }
    const unit = (id: string) => load(`units/${id}.json`) as { element: string };
    for (const id of ["prism-cairn", "wyrm-coffer", "glint-urn", "dusk-urn"] as const) {
      expect(DUNGEON_FAMILIES[id].single).toBe(unit(id).element);
    }
  });

  it("the EXP vessel series open on the material ladder by rarity (M4-03F)", () => {
    // Same rarity-to-gate ladder as the evolution materials: 3★ stage 4, 4★ stage 6, 5★ stage 8.
    const tiers = {
      flask: { rarity: 3, story: 4, ramp: 0, exp: 1506 },
      alembic: { rarity: 4, story: 6, ramp: 10, exp: 11012 },
      athanor: { rarity: 5, story: 8, ramp: 25, exp: 51518 },
      grail: { rarity: 5, story: 8, ramp: 25, exp: 151524 },
    } as const;
    for (const [id, tier] of Object.entries(tiers)) {
      const family = DUNGEON_FAMILIES[id as keyof typeof tiers];
      const gate = StageSchema.parse(load(`stages/${family.gate}.json`));
      expect(gate.story?.number).toBe(tier.story);
      expect(family.ramp).toBe(tier.ramp);
      for (const element of ELEMENTS) {
        const unit = load(`units/${materialUnitId(family, element)}.json`) as {
          element: string;
          forms: { rarity: number; fusionExp: number }[];
        };
        expect(unit.element).toBe(element);
        expect(unit.forms.map((form) => [form.rarity, form.fusionExp])).toEqual([
          [tier.rarity, tier.exp],
        ]);
      }
    }
  });

  it("the Crown Shard stage is in the Colossus series with a 1-then-20% key item", () => {
    const stage = crownShardStage();
    expect(StageSchema.parse(load(`stages/${stage.id}.json`))).toEqual(stage);
    expect(stage.dungeon).toEqual({
      series: "colossus",
      gate: CHAPTER_1_CLEAR,
      keyItem: { item: "crown-shard", rate: 20 },
      ramp: 45,
    });
    expect(stage.waves).toHaveLength(3);
    for (const slot of stage.waves.flatMap((wave) => wave.enemies)) {
      expect(Object.values(CHAPTER_1_DUNGEON_MOBS)).toContain(slot.enemy);
    }
  });

  it("stages capture their material at 25% in waves 1–2 and always in the final wave", () => {
    for (const family of families) {
      for (const element of familyElements(family)) {
        const stage = dungeonStage(family, element);
        const material = materialEnemy(family, element);
        expect(stage.waves).toHaveLength(3);
        expect(material.drops.capture).toEqual({
          unit: materialUnitId(family, element),
          rate: DUNGEON_CAPTURE_RATE,
        });
        const always = stage.waves.flatMap((wave, w) =>
          wave.enemies.filter((slot) => slot.capture === "always").map((slot) => [w, slot.enemy]),
        );
        expect(always).toEqual([[2, material.id]]);
        for (const wave of stage.waves) {
          expect(wave.enemies.some((slot) => slot.enemy === material.id)).toBe(true);
          for (const slot of wave.enemies) {
            expect([material.id, CHAPTER_1_DUNGEON_MOBS[element]]).toContain(slot.enemy);
          }
        }
      }
    }
  });

  it("has one chapter 1 dungeon companion mob per element, of that element", () => {
    for (const element of ELEMENTS) {
      const mob = EnemySchema.parse(load(`enemies/${CHAPTER_1_DUNGEON_MOBS[element]}.json`));
      expect(mob.element).toBe(element);
      expect(mob.drops.capture).toBeUndefined();
    }
  });
});
