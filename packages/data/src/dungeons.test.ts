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
  dungeonWaves,
  familyElements,
  GRAND_HOB,
  HOB_DUNGEONS,
  hobEnemy,
  hobStage,
  ITEM_DUNGEONS,
  ITEM_SERIES,
  itemCarrier,
  itemStage,
  materialEnemy,
  materialUnitId,
  TRIAL_1,
  ZENITH_CORE_STAGE_ID,
  zenithCoreStage,
} from "./dungeons.ts";
import { ELEMENTS } from "./schemas/common.ts";
import { EnemySchema } from "./schemas/enemy.ts";
import { ItemSchema } from "./schemas/item.ts";
import { StageSchema } from "./schemas/stage.ts";

// Farming-dungeon templates (M4-03C–F): every templated stage and material enemy file in content/
// is exactly what its family's template builds (rewrite them with `pnpm --filter @bfr/data
// dungeons`), and every series gates on its story stage.

const content = join(import.meta.dirname, "..", "content");

function load(path: string): unknown {
  return JSON.parse(readFileSync(join(content, path), "utf8"));
}

const families: readonly DungeonFamily[] = Object.values(DUNGEON_FAMILIES);

describe("hob series (M4-03I)", () => {
  it("has four Trial 1 stages sharing five daily clears and five matching capturable enemies", () => {
    for (const entry of [...HOB_DUNGEONS, GRAND_HOB]) {
      const enemy = hobEnemy(entry);
      expect(EnemySchema.parse(load(`enemies/${enemy.id}.json`))).toEqual(enemy);
      expect((load(`units/${entry.unit}.json`) as { element: string }).element).toBe(enemy.element);
      expect(enemy.drops.capture).toEqual({
        unit: entry.unit,
        rate: entry === GRAND_HOB ? 100 : 25,
      });
    }
    for (const entry of HOB_DUNGEONS) {
      const stage = hobStage(entry);
      expect(StageSchema.parse(load(`stages/${stage.id}.json`))).toEqual(stage);
      expect(stage.dungeon).toEqual({
        series: "hobs",
        gate: TRIAL_1,
        dailyLimit: 5,
        rareSpawn: { enemy: "dg-grand-hob", replaces: `dg-${entry.unit}`, rateBp: 1500 },
      });
      expect(
        stage.waves.flatMap((wave) => wave.enemies).filter((slot) => slot.capture),
      ).toHaveLength(1);
    }
  });

  it("resolves exactly one replacement in any wave at the 15% boundary, without mutating content", () => {
    const stage = hobStage(HOB_DUNGEONS[0]);
    for (const [seed, wave] of [
      [0, 0],
      [10000, 1],
      [20000, 2],
      [31499, 0],
    ] as const) {
      const waves = dungeonWaves(stage, seed);
      expect(waves.map((w) => w.enemies.length)).toEqual([2, 3, 3]);
      expect(
        waves.flatMap((w, i) =>
          w.enemies.filter((slot) => slot.enemy === "dg-grand-hob").map(() => i),
        ),
      ).toEqual([wave]);
    }
    expect(dungeonWaves(stage, 1500)).toBe(stage.waves);
    expect(dungeonWaves(stage, 4294967295)).toBe(stage.waves);
    expect(
      stage.waves.flatMap((w) => w.enemies).some((slot) => slot.enemy === "dg-grand-hob"),
    ).toBe(false);
    expect(() => dungeonWaves(stage, -1)).toThrow(RangeError);
    const malformed = structuredClone(stage);
    malformed.waves[0] = { enemies: [{ enemy: "dg1-gleam-crab" }] };
    expect(StageSchema.safeParse(malformed).success).toBe(false);
    const invalidRate = structuredClone(stage);
    if (invalidRate.dungeon?.rareSpawn) invalidRate.dungeon.rareSpawn.rateBp = 10001;
    expect(StageSchema.safeParse(invalidRate).success).toBe(false);
  });
});

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
      zenithCoreStage().id,
      ...ITEM_DUNGEONS.map((entry) => itemStage(entry).id),
      ...HOB_DUNGEONS.map((entry) => hobStage(entry).id),
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

  it("the Zenith Core stage is its own series, opened by Trial 1 with a +65% ramp (M4-02N)", () => {
    const stage = zenithCoreStage();
    expect(stage.id).toBe(ZENITH_CORE_STAGE_ID);
    expect(StageSchema.parse(load(`stages/${stage.id}.json`))).toEqual(stage);
    expect(stage.dungeon).toEqual({
      series: "zenith-core",
      gate: TRIAL_1,
      keyItem: { item: "zenith-core", rate: 20 },
      ramp: 65,
    });
    const trial = StageSchema.parse(load(`stages/${TRIAL_1}.json`));
    expect(trial.trial?.number).toBe(1);
    expect(trial.firstClear).toEqual({ gems: 0, items: [{ item: "zenith-core", count: 1 }] });
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

describe("battle item catalog and item series (M4-03G)", () => {
  // The original's starter items (BF Wiki item pages, GAME_DESIGN sources.md): Cure 100~120 HP,
  // High Cure 1,000, Mega Cure 2,000 (each + 10% REC, which BFR item heals drop: GAME_DESIGN §2),
  // Revive 1% HP, Fujin Potion fills the whole BB and SBB gauge, Antidote removes Poison.
  const expected = {
    "dew-tonic": [{ kind: "heal", amount: 100 }],
    "bright-tonic": [{ kind: "heal", amount: 1000 }],
    "grand-tonic": [{ kind: "heal", amount: 2000 }],
    "rekindle-ash": [{ kind: "revive", hpPercent: 1 }],
    "valor-draught": [{ kind: "bb_fill", bc: 100 }],
    bitterleaf: [{ kind: "cure", ailments: ["poison"] }],
  } as const;

  it("each starter item validates with its sourced single-target effect", () => {
    expect(ITEM_DUNGEONS.map((entry) => entry.item).sort()).toEqual(Object.keys(expected).sort());
    for (const entry of ITEM_DUNGEONS) {
      const item = ItemSchema.parse(load(`items/${entry.item}.json`));
      expect(item.name).toBe(entry.title);
      expect(item.target).toBe("single");
      expect(item.effects).toEqual(expected[entry.item as keyof typeof expected]);
    }
  });

  it("the BB-fill item fills every unit form's whole BB and SBB gauge", () => {
    const units = readdirSync(join(content, "units")).map(
      (name) =>
        load(`units/${name}`) as {
          forms: { bursts: { bb: { cost: number }; sbb?: { cost: number } } }[];
        },
    );
    const largest = Math.max(
      ...units.flatMap((unit) =>
        unit.forms.map((form) => form.bursts.bb.cost + (form.bursts.sbb?.cost ?? 0)),
      ),
    );
    expect(expected["valor-draught"][0].bc).toBeGreaterThanOrEqual(largest);
  });

  it("each item has one templated stage in the items series, gated on the story ladder", () => {
    const gates = {
      "dew-tonic": 4,
      bitterleaf: 4,
      "rekindle-ash": 4,
      "bright-tonic": 6,
      "valor-draught": 6,
      "grand-tonic": 8,
    } as const;
    for (const entry of ITEM_DUNGEONS) {
      const stage = itemStage(entry);
      expect(StageSchema.parse(load(`stages/${stage.id}.json`))).toEqual(stage);
      const carrier = itemCarrier(entry);
      expect(EnemySchema.parse(load(`enemies/${carrier.id}.json`))).toEqual(carrier);
      expect(stage.dungeon).toEqual({ series: ITEM_SERIES, gate: entry.gate });
      const gate = StageSchema.parse(load(`stages/${entry.gate}.json`));
      expect(gate.story?.number).toBe(gates[entry.item as keyof typeof gates]);
      expect(carrier.drops.items).toEqual([{ item: entry.item, rate: entry.rate }]);
      expect(carrier.drops.capture).toBeUndefined();
      expect(stage.waves).toHaveLength(3);
      for (const wave of stage.waves) {
        expect(wave.enemies.map((slot) => slot.enemy)).toEqual([
          CHAPTER_1_DUNGEON_MOBS[entry.element],
          carrier.id,
          CHAPTER_1_DUNGEON_MOBS[entry.element],
        ]);
      }
    }
  });
});
