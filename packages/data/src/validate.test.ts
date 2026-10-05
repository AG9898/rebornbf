import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type Enemy, EnemySchema } from "./schemas/enemy.ts";
import { type Stage, StageSchema } from "./schemas/stage.ts";
import { type Unit, UnitSchema } from "./schemas/unit.ts";
import {
  chapterFirstClearGems,
  formatPath,
  validateBannerFile,
  validateDropRefs,
  validateDungeons,
  validateEnemyFile,
  validateEvolutionRefs,
  validateFirstClearItems,
  validateFirstClearSpheres,
  validateFirstClearUnits,
  validateGemBudget,
  validateItemFile,
  validateStageFile,
  validateStory,
  validateTrials,
  validateTutorials,
  validateUnitFile,
} from "./validate.ts";

const unitsDir = join(import.meta.dirname, "..", "content", "units");
const unitFiles = readdirSync(unitsDir).filter((name) => name.endsWith(".json"));

function loadUnit(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(unitsDir, name), "utf8"));
}

/** Deep-clones the placeholder fixture so each test can break it independently. */
function ember(): { forms: Array<Record<string, unknown>> } & Record<string, unknown> {
  return structuredClone(loadUnit("placeholder-ember.json")) as ReturnType<typeof ember>;
}

describe("formatPath", () => {
  it("renders keys and indices", () => {
    expect(formatPath(["forms", 0, "bursts", "bb", "effects", 1, "id"])).toBe(
      "forms[0].bursts.bb.effects[1].id",
    );
    expect(formatPath([])).toBe("(root)");
  });
});

describe("validateUnitFile", () => {
  it("has at least two unit files", () => {
    expect(unitFiles.length).toBeGreaterThanOrEqual(2);
  });

  it.each(unitFiles)("%s is valid", (name) => {
    expect(validateUnitFile(`units/${name}`, loadUnit(name))).toEqual([]);
  });

  it("reports an unknown effect ID with a readable path", () => {
    const unit = ember();
    const form = unit.forms[0] as { bursts: { bb: { effects: Array<{ id: string }> } } };
    (form.bursts.bb.effects[1] as { id: string }).id = "buff.speed";
    const errors = validateUnitFile("units/placeholder-ember.json", unit);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(
      /^units\/placeholder-ember\.json: forms\[0\]\.bursts\.bb\.effects\[1\]\.id: /,
    );
  });

  it("reports a distribution not summing to 100 with a readable path", () => {
    const unit = ember();
    const form = unit.forms[0] as { normalAttack: { damageDistribution: number[] } };
    form.normalAttack.damageDistribution = [30, 30, 30];
    expect(validateUnitFile("units/placeholder-ember.json", unit)).toEqual([
      "units/placeholder-ember.json: forms[0].normalAttack.damageDistribution: must sum to 100 (got 90)",
    ]);
  });

  it("rejects a malformed source and a mismatched file name", () => {
    const unit = ember();
    unit.source = { unit: "Some Source Unit" };
    expect(validateUnitFile("units/placeholder-ember.json", unit)[0]).toContain(": source: ");
    expect(validateUnitFile("units/other.json", ember())[0]).toContain(
      'must match the file name "other"',
    );
  });

  it("rejects duplicate form IDs", () => {
    const unit = ember();
    unit.forms.push(structuredClone(unit.forms[0] as Record<string, unknown>));
    expect(validateUnitFile("units/placeholder-ember.json", unit)).toEqual([
      'units/placeholder-ember.json: forms[1].id: duplicate form ID "placeholder-ember-5"',
    ]);
  });

  it("gives every launch unit a valid quote and no other unit one (M4-06G)", () => {
    const launch = ["aurelle", "brand", "garrick", "maren", "morrick", "rook", "solen", "vespera"];
    for (const name of unitFiles) {
      const unit = UnitSchema.parse(loadUnit(name));
      if (launch.includes(unit.id)) {
        expect(unit.quote, unit.id).toEqual(expect.any(String));
      } else {
        expect(unit.quote, unit.id).toBeUndefined();
      }
    }
  });

  it("rejects an over-long, multi-line, untrimmed, or fodder quote", () => {
    const quoted = (quote: string) => ({ ...ember(), quote });
    expect(validateUnitFile("units/placeholder-ember.json", quoted("A short line."))).toEqual([]);
    for (const bad of ["x".repeat(81), "One line.\nTwo lines.", " Padded.", ""]) {
      expect(validateUnitFile("units/placeholder-ember.json", quoted(bad))[0]).toContain(
        "units/placeholder-ember.json: quote: ",
      );
    }
    const fodder = { ...loadUnit("cinder-sprite.json"), quote: "Pick me." };
    expect(validateUnitFile("units/cinder-sprite.json", fodder)).toEqual([
      "units/cinder-sprite.json: quote: fodder and material units have no quote",
    ]);
  });

  it("accepts a unit without a source (the public mirror strips it, RESOLVED-61)", () => {
    const unit = ember();
    delete unit.source;
    expect(validateUnitFile("units/placeholder-ember.json", unit)).toEqual([]);
  });

  it("accepts an original (non-homage) source", () => {
    const unit = ember();
    unit.source = { original: true };
    expect(validateUnitFile("units/placeholder-ember.json", unit)).toEqual([]);
  });

  it("accepts a homage source with a URL", () => {
    const unit = ember();
    unit.source = { unit: "Some Source Unit", url: "https://example.com/unit" };
    expect(validateUnitFile("units/placeholder-ember.json", unit)).toEqual([]);
  });
});

const contentDir = join(import.meta.dirname, "..", "content");

function loadContent(file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(contentDir, file), "utf8"));
}

const enemyFiles = readdirSync(join(contentDir, "enemies")).filter((n) => n.endsWith(".json"));
const stageFiles = readdirSync(join(contentDir, "stages")).filter((n) => n.endsWith(".json"));
const enemyIds = new Set(enemyFiles.map((n) => n.replace(/\.json$/, "")));

describe("validateEnemyFile", () => {
  it.each(enemyFiles)("%s is valid", (name) => {
    expect(validateEnemyFile(`enemies/${name}`, loadContent(`enemies/${name}`))).toEqual([]);
  });

  it("reports a malformed AI rule with a readable path", () => {
    const brute = loadContent("enemies/placeholder-brute.json") as {
      ai: Array<Record<string, unknown>>;
    };
    (brute.ai[2] as Record<string, unknown>).n = 0;
    const errors = validateEnemyFile("enemies/placeholder-brute.json", brute);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^enemies\/placeholder-brute\.json: ai\[2\]\.n: /);
  });

  it("rejects a mismatched file name", () => {
    const grunt = loadContent("enemies/placeholder-grunt.json");
    expect(validateEnemyFile("enemies/other.json", grunt)[0]).toContain(
      'must match the file name "other"',
    );
  });
});

describe("validateStageFile", () => {
  it.each(stageFiles)("%s is valid", (name) => {
    expect(validateStageFile(`stages/${name}`, loadContent(`stages/${name}`), enemyIds)).toEqual(
      [],
    );
  });

  it("has a placeholder stage with two waves", () => {
    const stage = loadContent("stages/placeholder-stage.json") as { waves: unknown[] };
    expect(stage.waves).toHaveLength(2);
  });

  it("reports an unknown wave enemy", () => {
    const stage = loadContent("stages/placeholder-stage.json") as {
      waves: Array<{ enemies: Array<{ enemy: string }> }>;
    };
    (stage.waves[1]?.enemies[0] as { enemy: string }).enemy = "missing-enemy";
    expect(validateStageFile("stages/placeholder-stage.json", stage, enemyIds)).toEqual([
      'stages/placeholder-stage.json: waves[1].enemies[0].enemy: unknown enemy "missing-enemy"',
    ]);
  });
});

describe("story stages (M3-04A)", () => {
  const stages = (): Stage[] =>
    stageFiles.map((name) => StageSchema.parse(loadContent(`stages/${name}`)));

  it("the shipped story is valid", () => {
    expect(validateStory(stages())).toEqual([]);
  });

  it("rejects a boss outside the last wave", () => {
    const stage = structuredClone(loadContent("stages/story-08-beacon-hollow.json")) as {
      waves: Array<{ enemies: Array<Record<string, unknown>> }>;
    };
    (stage.waves[0]?.enemies[0] as Record<string, unknown>).boss = true;
    expect(validateStageFile("stages/story-08-beacon-hollow.json", stage, enemyIds)).toEqual([
      "stages/story-08-beacon-hollow.json: waves[0].enemies[0].boss: a boss may only be in the last wave",
    ]);
  });

  it("reports a missing stage, a duplicate number, and a chapter end without a boss", () => {
    const all = stages();
    const noBoss = all.map((stage) =>
      stage.story?.number === 8
        ? { ...stage, waves: [{ enemies: [{ enemy: "ch1-gravemaw" }] }] }
        : stage.story?.number === 3
          ? { ...stage, story: { chapter: 1, number: 2, text: "x" } }
          : stage,
    );
    expect(validateStory(noBoss)).toEqual([
      expect.stringMatching(/story\.number: stage 2 is also "story-0[23]-/),
      "stages: chapter 1 has no stage 3",
      "stages/story-08-beacon-hollow.json: waves: stage 8 ends chapter 1 and needs a boss",
    ]);
  });

  it("reports a number outside its chapter", () => {
    const [first] = stages().filter((stage) => stage.story?.number === 1);
    if (!first?.story) throw new Error("stage 1 missing");
    const moved = { ...first, story: { ...first.story, number: 9 } };
    expect(validateStory([moved])).toContain(
      "stages/story-01-brightmere-outskirts.json: story.number: stage 9 is outside chapter 1 (1-8)",
    );
  });
});

describe("story Lantern Toads (M4-04G)", () => {
  const stages = (): Stage[] =>
    stageFiles.map((name) => StageSchema.parse(loadContent(`stages/${name}`)));

  it("grants the RESOLVED-71 schedule, 108 in all: 18 burst levels for each of six starters", () => {
    const schedule = new Map<number, number>();
    let total = 0;
    const toads: string[] = [];
    for (const stage of stages()) {
      for (const entry of stage.firstClear?.units ?? []) {
        if (entry.unit === "satchel-toad") {
          // The one Satchel Toad is Trial 2's first-clear reward (M4-04F).
          toads.push(`${stage.id}:${entry.count}`);
          continue;
        }
        expect(stage.story, `${stage.id} grants units outside the story`).toBeDefined();
        expect(entry.unit).toBe("lantern-toad");
        schedule.set(stage.story?.number ?? 0, entry.count);
        total += entry.count;
      }
    }
    expect(Object.fromEntries(schedule)).toEqual({
      2: 18,
      4: 9,
      6: 9,
      8: 9,
      10: 18,
      12: 15,
      14: 15,
      16: 15,
    });
    // Each Lantern Toad is +1 burst level; BB and SBB each go 1 -> 10 (§6 → Burst levels).
    expect(total).toBe(108);
    expect(total).toBe(6 * 2 * (10 - 1));
    expect(toads).toEqual(["trial-02-master-ozric:1"]);
  });

  it("checks first-clear units exist and are stackable", () => {
    const units = new Map(
      ["lantern-toad.json", "satchel-toad.json", "placeholder-ember.json"].map((name) => {
        const unit = UnitSchema.parse(loadUnit(name));
        return [unit.id, unit] as const;
      }),
    );
    expect(validateFirstClearUnits(stages(), units)).toEqual([]);
    const story = stages().find((stage) => stage.story?.number === 2) as Stage;
    const bad: Stage = {
      ...story,
      firstClear: {
        gems: 0,
        units: [
          { unit: "placeholder-ember", count: 1 },
          { unit: "missing-toad", count: 1 },
        ],
      },
    };
    expect(validateFirstClearUnits([bad], units)).toEqual([
      `stages/${story.id}.json: firstClear.units[0].unit: unit "placeholder-ember" is not stackable`,
      `stages/${story.id}.json: firstClear.units[1].unit: unknown unit "missing-toad"`,
    ]);
  });
});

describe("gem budget (M5-02)", () => {
  const stages = (): Stage[] =>
    stageFiles.map((name) => StageSchema.parse(loadContent(`stages/${name}`)));

  it("chapter 1 grants 350 first-clear gems and chapter 2 grants 400", () => {
    const totals = chapterFirstClearGems(stages());
    expect(totals.get(1)).toBe(350);
    expect(totals.get(2)).toBe(400);
    expect(validateGemBudget(stages())).toEqual([]);
  });

  it("fails when chapter 1 gems total less than 350", () => {
    const short = stages().map((stage) =>
      stage.story?.number === 8 ? { ...stage, firstClear: { gems: 149 } } : stage,
    );
    expect(validateGemBudget(short)).toEqual([
      "stages: chapter 1 first clears grant 349 gems; the budget is 350",
    ]);
  });

  it("counts only story stages and reports a missing chapter as zero", () => {
    expect(validateGemBudget([])).toEqual([
      "stages: chapter 1 first clears grant 0 gems; the budget is 350",
      "stages: chapter 2 first clears grant 0 gems; the budget is 400",
    ]);
  });
});

describe("validateBannerFile (M5-01B)", () => {
  const unitForms = new Map(
    unitFiles.map((name) => {
      const unit = loadUnit(name) as { id: string; forms: Array<{ id: string }> };
      return [unit.id, new Set(unit.forms.map((form) => form.id))] as const;
    }),
  );
  const bannerFiles = readdirSync(join(contentDir, "banners")).filter((n) => n.endsWith(".json"));
  type BannerJson = {
    pityPulls: number;
    featured: Array<{ unit: string; form: string; rateBp: number }>;
    pool: Array<{ unit: string; form: string; rateBp: number }>;
  };
  const launch = (): BannerJson =>
    loadContent("banners/launch-summon.json") as unknown as BannerJson;
  const file = "banners/launch-summon.json";

  it.each(bannerFiles)("%s is valid", (name) => {
    expect(
      validateBannerFile(`banners/${name}`, loadContent(`banners/${name}`), unitForms),
    ).toEqual([]);
  });

  it("the launch banner features Aurelle and Vespera at 5★, 3% combined, 80-pull pity", () => {
    const banner = launch();
    expect(banner.featured).toEqual([
      { unit: "aurelle", form: "aurelle-5", rateBp: 150 },
      { unit: "vespera", form: "vespera-5", rateBp: 150 },
    ]);
    expect(banner.pityPulls).toBe(80);
    const all = [...banner.featured, ...banner.pool];
    expect(all.reduce((total, entry) => total + entry.rateBp, 0)).toBe(10_000);
    // The rest of the pool is BFR-original low-rarity filler (RESOLVED-14).
    for (const entry of banner.pool) {
      const unit = loadUnit(`${entry.unit}.json`) as {
        source: unknown;
        forms: Array<{ id: string; rarity: number | string }>;
      };
      // The public mirror strips `source` (RESOLVED-61); where present it marks BFR-original.
      expect([undefined, { original: true }]).toContainEqual(unit.source);
      const form = unit.forms.find((f) => f.id === entry.form);
      expect(form?.rarity).toBeLessThanOrEqual(3);
    }
  });

  it("rejects rates that do not sum to 100%", () => {
    const banner = launch();
    (banner.pool[0] as { rateBp: number }).rateBp += 1;
    expect(validateBannerFile(file, banner, unitForms)).toEqual([
      `${file}: (root): rates must sum to 10000 bp (100%) (got 10001)`,
    ]);
  });

  it("rejects unknown units, unknown forms, and duplicate forms", () => {
    const unknownUnit = launch();
    (unknownUnit.pool[0] as { unit: string }).unit = "missing-unit";
    expect(validateBannerFile(file, unknownUnit, unitForms)).toEqual([
      `${file}: pool[0].unit: unknown unit "missing-unit"`,
    ]);

    const unknownForm = launch();
    (unknownForm.featured[0] as { form: string }).form = "aurelle-2";
    expect(validateBannerFile(file, unknownForm, unitForms)).toEqual([
      `${file}: featured[0].form: unit "aurelle" has no form "aurelle-2"`,
    ]);

    const duplicate = launch();
    const moved = duplicate.pool.pop() as { unit: string; form: string; rateBp: number };
    duplicate.pool.push({ ...(duplicate.pool[0] as typeof moved), rateBp: moved.rateBp });
    expect(validateBannerFile(file, duplicate, unitForms)).toEqual([
      `${file}: pool[${duplicate.pool.length - 1}].form: duplicate banner form "cinder-sprite-2"`,
    ]);
  });

  it("requires at least one featured entry", () => {
    const banner = launch();
    const featured = banner.featured.splice(0);
    (banner.pool[0] as { rateBp: number }).rateBp += featured.reduce((t, e) => t + e.rateBp, 0);
    expect(validateBannerFile(file, banner, unitForms)[0]).toMatch(
      /^banners\/launch-summon\.json: featured: /,
    );
  });
});

describe("evolution materials and recipes (M4-02D)", () => {
  const unitIds = new Set(unitFiles.map((name) => name.slice(0, -".json".length)));
  const itemsDir = join(import.meta.dirname, "..", "content", "items");
  const itemFiles = readdirSync(itemsDir).filter((name) => name.endsWith(".json"));
  const itemIds = new Set(itemFiles.map((name) => name.slice(0, -".json".length)));
  const prefixes = ["cinder", "rill", "moss", "volt", "glint", "dusk"];
  const families = [
    ["mote", 1],
    ["sprite", 2],
    ["effigy", 3],
    ["cairn", 4],
    ["colossus", 5],
  ] as const;
  const singles = [
    ["prism-cairn", "light", 5],
    ["glint-urn", "light", 3],
    ["dusk-urn", "dark", 3],
    ["wyrm-coffer", "dark", 5],
  ] as const;

  it("has every per-element family and single material unit as BFR-original level-1 fodder", () => {
    const expected: Array<readonly [string, number]> = [
      ...prefixes.flatMap((p) => families.map(([f, r]) => [`${p}-${f}`, r] as const)),
      ...singles.map(([id, , r]) => [id, r] as const),
    ];
    for (const [id, rarity] of expected) {
      const unit = UnitSchema.parse(loadUnit(`${id}.json`));
      expect(unit.forms, id).toHaveLength(1);
      expect(unit.forms[0]?.rarity, id).toBe(rarity);
      expect(unit.forms[0]?.id, id).toBe(`${id}-${rarity}`);
      // The Sprites are ordinary 2★ filler; every new material is level-1 with flat stats.
      if (!id.endsWith("-sprite")) {
        expect(unit.forms[0]?.maxLevel, id).toBe(1);
        // The public mirror strips `source` (RESOLVED-61); where present it marks BFR-original.
        expect([undefined, { original: true }], id).toContainEqual(unit.source);
      }
    }
    for (const [id, element] of singles) {
      expect(UnitSchema.parse(loadUnit(`${id}.json`)).element).toBe(element);
    }
  });

  it.each(itemFiles)("items/%s is valid", (name) => {
    const json = JSON.parse(readFileSync(join(itemsDir, name), "utf8"));
    expect(validateItemFile(`items/${name}`, json)).toEqual([]);
  });

  it("the Crown Shard is a material item", () => {
    const shard = JSON.parse(readFileSync(join(itemsDir, "crown-shard.json"), "utf8"));
    expect(shard).toMatchObject({ id: "crown-shard", kind: "material", name: "Crown Shard" });
  });

  it("accepts a recipe of existing units and items on a non-last form", () => {
    const unit = ember();
    unit.forms.unshift({ ...structuredClone(unit.forms[0]), id: "placeholder-ember-1" });
    (unit.forms[0] as Record<string, unknown>).evolution = {
      units: [
        { unit: "cinder-effigy", count: 1 },
        { unit: "cinder-mote", count: 2 },
      ],
      items: [{ item: "crown-shard", count: 1 }],
      zel: 200_000,
    };
    const parsed = UnitSchema.parse(unit);
    expect(validateEvolutionRefs("units/x.json", parsed, unitIds, itemIds)).toEqual([]);
  });

  it("reports unknown recipe units and items", () => {
    const unit = ember();
    unit.forms.unshift({ ...structuredClone(unit.forms[0]), id: "placeholder-ember-1" });
    (unit.forms[0] as Record<string, unknown>).evolution = {
      units: [{ unit: "missing-mote", count: 1 }],
      items: [{ item: "missing-shard", count: 1 }],
      zel: 0,
    };
    const parsed = UnitSchema.parse(unit);
    expect(validateEvolutionRefs("units/x.json", parsed, unitIds, itemIds)).toEqual([
      'units/x.json: forms[0].evolution.units[0].unit: unknown unit "missing-mote"',
      'units/x.json: forms[0].evolution.items[0].item: unknown item "missing-shard"',
    ]);
  });
});

describe("farming dungeons (M4-03B)", () => {
  const grunt = EnemySchema.parse(loadContent("enemies/placeholder-grunt.json"));
  const mote: Enemy = {
    ...grunt,
    id: "test-mote",
    drops: { capture: { unit: "moss-mote", rate: 25 }, items: [{ item: "crown-shard", rate: 5 }] },
  };
  const enemies = new Map<string, Enemy>([
    [mote.id, mote],
    [grunt.id, grunt],
  ]);
  const unitIds = new Set(["moss-mote"]);
  const itemIds = new Set(["crown-shard"]);
  const story = StageSchema.parse(loadContent("stages/story-01-brightmere-outskirts.json"));
  const dungeon = StageSchema.parse({
    id: "test-dungeon",
    name: "Test Dungeon",
    dungeon: { series: "test", gate: story.id, keyItem: { item: "crown-shard", rate: 20 } },
    waves: [
      { enemies: [{ enemy: "test-mote" }] },
      { enemies: [{ enemy: "test-mote" }] },
      { enemies: [{ enemy: "test-mote", capture: "always" }] },
    ],
  });

  it("accepts a gated dungeon with a key item and a capturing final wave", () => {
    expect(validateDungeons([story, dungeon], enemies, itemIds)).toEqual([]);
    expect(validateDropRefs("enemies/test-mote.json", mote, unitIds, itemIds)).toEqual([]);
  });

  it("reports unknown gates, dungeon gates, unknown key items, and uncapturable slots", () => {
    const unknownGate = { ...dungeon, dungeon: { series: "test", gate: "nowhere" } };
    expect(validateDungeons([unknownGate], enemies, itemIds)).toEqual([
      'stages/test-dungeon.json: dungeon.gate: unknown stage "nowhere"',
    ]);
    const chained: Stage = {
      ...dungeon,
      id: "test-dungeon-2",
      dungeon: { series: "test", gate: "test-dungeon", keyItem: { item: "lost", rate: 1 } },
      waves: [{ enemies: [{ enemy: "placeholder-grunt", capture: "always" }] }],
    };
    expect(validateDungeons([story, dungeon, chained], enemies, itemIds)).toEqual([
      'stages/test-dungeon-2.json: dungeon.gate: "test-dungeon" is a dungeon stage, not a story gate',
      'stages/test-dungeon-2.json: dungeon.keyItem.item: unknown item "lost"',
      'stages/test-dungeon-2.json: waves[0].enemies[0].capture: enemy "placeholder-grunt" has no capture drop',
    ]);
  });

  it("reports a series whose stages disagree on the daily clear limit", () => {
    const limited: Stage = {
      ...dungeon,
      dungeon: { series: "test", gate: story.id, dailyLimit: 5 },
    };
    const twin: Stage = { ...limited, id: "test-dungeon-2" };
    expect(validateDungeons([story, limited, twin], enemies, itemIds)).toEqual([]);
    const unlimited: Stage = { ...dungeon, id: "test-dungeon-3" };
    expect(validateDungeons([story, limited, unlimited], enemies, itemIds)).toEqual([
      'stages/test-dungeon-3.json: dungeon.dailyLimit: series "test" has 5 on "test-dungeon"',
    ]);
  });

  it("checks rare replacement enemy references and final-wave capture compatibility", () => {
    const stage = (enemy: string): Stage => ({
      ...dungeon,
      dungeon: {
        series: "test",
        gate: story.id,
        rareSpawn: { enemy, replaces: mote.id, rateBp: 1500 },
      },
    });
    expect(validateDungeons([story, stage(mote.id)], enemies, itemIds)).toEqual([]);
    expect(validateDungeons([story, stage("missing")], enemies, itemIds)).toEqual([
      'stages/test-dungeon.json: dungeon.rareSpawn.enemy: unknown enemy "missing"',
    ]);
    expect(validateDungeons([story, stage(grunt.id)], enemies, itemIds)).toEqual([
      "stages/test-dungeon.json: dungeon.rareSpawn.enemy: replacement has no capture drop",
    ]);
  });

  it("checks final-spawn enemy references and final-wave capture compatibility (M4-03K)", () => {
    const stage = (enemy: string): Stage => ({
      ...dungeon,
      dungeon: {
        series: "test",
        gate: story.id,
        finalSpawns: [{ enemy, replaces: mote.id, rateBp: 1000 }],
      },
    });
    expect(validateDungeons([story, stage(mote.id)], enemies, itemIds)).toEqual([]);
    expect(validateDungeons([story, stage("missing")], enemies, itemIds)).toEqual([
      'stages/test-dungeon.json: dungeon.finalSpawns[0].enemy: unknown enemy "missing"',
    ]);
    expect(validateDungeons([story, stage(grunt.id)], enemies, itemIds)).toEqual([
      "stages/test-dungeon.json: dungeon.finalSpawns[0].enemy: replacement has no capture drop",
    ]);
  });

  it("reports drops that name unknown units or items", () => {
    expect(validateDropRefs("enemies/test-mote.json", mote, new Set(), new Set())).toEqual([
      'enemies/test-mote.json: drops.capture.unit: unknown unit "moss-mote"',
      'enemies/test-mote.json: drops.items[0].item: unknown item "crown-shard"',
    ]);
  });
});

describe("trials (M6-01A)", () => {
  const story = StageSchema.parse(loadContent("stages/story-01-brightmere-outskirts.json"));
  const trial = StageSchema.parse({
    id: "test-trial",
    name: "Test Trial",
    trial: { number: 1, gate: story.id },
    waves: [{ enemies: [{ enemy: "placeholder-brute", boss: true }] }],
  });

  it("accepts a numbered trial gated on a story stage", () => {
    expect(validateTrials([story, trial])).toEqual([]);
  });

  it("reports repeated numbers, unknown gates, and non-story gates", () => {
    const twin: Stage = { ...trial, id: "test-trial-2", trial: { number: 1, gate: "nowhere" } };
    const chained: Stage = { ...trial, id: "test-trial-3", trial: { number: 3, gate: trial.id } };
    expect(validateTrials([story, trial, twin, chained])).toEqual([
      'stages/test-trial-2.json: trial.number: trial 1 is also "test-trial"',
      'stages/test-trial-2.json: trial.gate: unknown stage "nowhere"',
      'stages/test-trial-3.json: trial.gate: "test-trial" is not a story stage',
    ]);
  });

  it("checks first-clear reward items against the item files (M4-02N)", () => {
    const rewarded: Stage = {
      ...trial,
      firstClear: { gems: 0, items: [{ item: "zenith-core", count: 1 }] },
    };
    expect(validateFirstClearItems([rewarded], new Set(["zenith-core"]))).toEqual([]);
    expect(validateFirstClearItems([rewarded], new Set(["crown-shard"]))).toEqual([
      'stages/test-trial.json: firstClear.items[0].item: unknown item "zenith-core"',
    ]);
  });

  it("checks first-clear reward spheres against the sphere files (M4-04F)", () => {
    const rewarded: Stage = {
      ...trial,
      firstClear: { gems: 0, spheres: [{ sphere: "vanguard-seal", count: 6 }], signatureClaims: 1 },
    };
    expect(validateFirstClearSpheres([rewarded], new Set(["vanguard-seal"]))).toEqual([]);
    expect(validateFirstClearSpheres([rewarded], new Set(["wayfarer-seal"]))).toEqual([
      'stages/test-trial.json: firstClear.spheres[0].sphere: unknown sphere "vanguard-seal"',
    ]);
    expect(
      StageSchema.safeParse({ ...rewarded, firstClear: { gems: 0, signatureClaims: 0 } }).success,
    ).toBe(false);
  });

  it("rejects a trial with no boss or that is also a story stage", () => {
    const base = { id: "t", name: "T", trial: { number: 1, gate: "s" } };
    expect(StageSchema.safeParse({ ...base, waves: [{ enemies: [{ enemy: "x" }] }] }).success).toBe(
      false,
    );
    expect(
      StageSchema.safeParse({
        ...base,
        story: { chapter: 1, number: 1, text: "x" },
        waves: [{ enemies: [{ enemy: "x", boss: true }] }],
      }).success,
    ).toBe(false);
  });
});

describe("tutorial stage (M3-06D)", () => {
  const tutorial = StageSchema.parse(loadContent("stages/tutorial.json"));
  const preset = tutorial.tutorial;
  if (!preset) throw new Error("stages/tutorial.json has no tutorial block");
  const units = new Map<string, Unit>(
    [...preset.units, ...(preset.ally ? [preset.ally] : [])].map((id) => [
      id,
      UnitSchema.parse(loadContent(`units/${id}.json`)),
    ]),
  );
  const enemies = new Map<string, Enemy>(
    tutorial.waves
      .flatMap((wave) => wave.enemies.map((slot) => slot.enemy))
      .map((id) => [id, EnemySchema.parse(loadContent(`enemies/${id}.json`))]),
  );

  it("is valid and grants nothing", () => {
    expect(tutorial.story ?? tutorial.dungeon ?? tutorial.firstClear).toBeUndefined();
    expect(validateTutorials([tutorial], units, enemies)).toEqual([]);
  });

  it("rejects a tutorial with a reward", () => {
    const result = StageSchema.safeParse({ ...tutorial, firstClear: { gems: 5 } });
    expect(result.success).toBe(false);
  });

  it("reports unknown units, missing forms, levels past max, and rewarding enemies", () => {
    const grunt = EnemySchema.parse(loadContent("enemies/placeholder-grunt.json"));
    const broken: Stage = {
      ...tutorial,
      tutorial: { ...preset, units: ["brand", "nobody"], rarity: 3, level: 41 },
      waves: [{ enemies: [{ enemy: "rich" }] }],
    };
    const rich: Enemy = { ...grunt, id: "rich", drops: { zel: { rate: 50, amount: 10 } } };
    expect(validateTutorials([broken], units, new Map([["rich", rich]]))).toEqual([
      "stages/tutorial.json: tutorial.level: above brand-3's max level 40",
      'stages/tutorial.json: tutorial.units[1]: unknown unit "nobody"',
      "stages/tutorial.json: tutorial.level: above morrick-3's max level 40",
      'stages/tutorial.json: waves[0].enemies[0].enemy: "rich" drops rewards; the tutorial grants none',
    ]);
  });
});
