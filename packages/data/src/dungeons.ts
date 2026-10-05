import { ELEMENTS, type Element } from "./schemas/common.ts";
import type { Enemy } from "./schemas/enemy.ts";
import type { Stage } from "./schemas/stage.ts";
import type { Stats } from "./schemas/unit.ts";

// Farming-dungeon templates (GAME_DESIGN §7 → Farming dungeons, RESOLVED-70, RESOLVED-72). Every
// material family's stages and material enemies (one per element for per-element families, one for
// a single-unit family) and the Crown Shard stage are built here, one template per family, and
// written to content/ by `pnpm --filter @bfr/data dungeons`. `dungeons.test.ts` fails when a
// content file drifts from its template. Numbers are BFR tuning, not source values.

/** Material-unit element prefixes, shared with the Sprites (GAME_DESIGN §6 → Growth fodder). */
export const ELEMENT_PREFIXES: Readonly<Record<Element, string>> = {
  fire: "cinder",
  water: "rill",
  earth: "moss",
  thunder: "volt",
  light: "glint",
  dark: "dusk",
};

/**
 * The chapter 1 dungeon companion mobs (RESOLVED-72), one per element: the non-material enemies of
 * every series that opens in chapter 1 or on the Trial 1 first clear.
 */
export const CHAPTER_1_DUNGEON_MOBS: Readonly<Record<Element, string>> = {
  fire: "dg1-ember-mite",
  water: "dg1-drip-newt",
  earth: "dg1-root-crawler",
  thunder: "dg1-static-eel",
  light: "dg1-gleam-crab",
  dark: "dg1-gloom-bat",
};

/** The chapter 1 clear (story stage 8), gate of the 6★ and 7★ material series (RESOLVED-67). */
export const CHAPTER_1_CLEAR = "story-08-beacon-hollow";

/** Capture chance of a material enemy in waves 1–2 (RESOLVED-70); the final wave's is always. */
export const DUNGEON_CAPTURE_RATE = 25;

/**
 * A material family's dungeon series: one stage per element from one template, or one stage for a
 * single-unit family (`single` set, e.g. Prism Cairn).
 */
export interface DungeonFamily {
  /**
   * Family and series ID. The material unit of element `e` is `<prefix(e)>-<family>`; a
   * single-unit family's unit ID is the family ID itself (e.g. `prism-cairn`).
   */
  readonly family: string;
  /** Display name of the family, e.g. "Sprite"; a single-unit family's is its unit's name. */
  readonly title: string;
  /** Set for a single-unit family: the one element its unit and stage have. */
  readonly single?: Element;
  /** Place noun in each stage's name, e.g. "Den" for "Cinder Sprite Den". */
  readonly place: string;
  /** The story stage whose first clear opens the series (GAME_DESIGN §6 → Dungeon gates). */
  readonly gate: string;
  /** The material enemy's stats (the same for every element). */
  readonly stats: Stats;
  /** The material enemy's Zel drop. */
  readonly zel: { readonly rate: number; readonly amount: number };
  /** Difficulty ramp in percent on every enemy's HP and ATK (RESOLVED-71); 0 below the 5★ tier. */
  readonly ramp: number;
}

/** The per-element families with dungeon series, by family ID. */
export const DUNGEON_FAMILIES = {
  sprite: {
    family: "sprite",
    title: "Sprite",
    place: "Den",
    gate: "story-04-rustwood-hollow",
    stats: { hp: 3000, atk: 650, def: 300, rec: 100 },
    zel: { rate: 50, amount: 30 },
    ramp: 0,
  },
  effigy: {
    family: "effigy",
    title: "Effigy",
    place: "Crypt",
    gate: "story-04-rustwood-hollow",
    stats: { hp: 3500, atk: 650, def: 700, rec: 100 },
    zel: { rate: 50, amount: 40 },
    ramp: 0,
  },
  mote: {
    family: "mote",
    title: "Mote",
    place: "Hollow",
    gate: "story-06-sunken-waystation",
    stats: { hp: 4000, atk: 1400, def: 1200, rec: 100 },
    zel: { rate: 50, amount: 30 },
    ramp: 10,
  },
  cairn: {
    family: "cairn",
    title: "Cairn",
    place: "Barrow",
    gate: "story-06-sunken-waystation",
    stats: { hp: 7000, atk: 1300, def: 1000, rec: 100 },
    zel: { rate: 50, amount: 60 },
    ramp: 10,
  },
  "prism-cairn": {
    family: "prism-cairn",
    title: "Prism Cairn",
    single: "light",
    place: "Vault",
    gate: CHAPTER_1_CLEAR,
    stats: { hp: 8000, atk: 1700, def: 1500, rec: 100 },
    zel: { rate: 50, amount: 100 },
    ramp: 25,
  },
  "wyrm-coffer": {
    family: "wyrm-coffer",
    title: "Wyrm Coffer",
    single: "dark",
    place: "Tomb",
    gate: CHAPTER_1_CLEAR,
    stats: { hp: 8000, atk: 1700, def: 1500, rec: 100 },
    zel: { rate: 50, amount: 100 },
    ramp: 25,
  },
  colossus: {
    family: "colossus",
    title: "Colossus",
    place: "Forge",
    gate: CHAPTER_1_CLEAR,
    stats: { hp: 9000, atk: 1800, def: 1500, rec: 100 },
    zel: { rate: 50, amount: 120 },
    ramp: 45,
  },
  "glint-urn": {
    family: "glint-urn",
    title: "Glint Urn",
    single: "light",
    place: "Reliquary",
    gate: CHAPTER_1_CLEAR,
    stats: { hp: 6000, atk: 1600, def: 1800, rec: 100 },
    zel: { rate: 50, amount: 80 },
    ramp: 45,
  },
  "dusk-urn": {
    family: "dusk-urn",
    title: "Dusk Urn",
    single: "dark",
    place: "Reliquary",
    gate: CHAPTER_1_CLEAR,
    stats: { hp: 6000, atk: 1600, def: 1800, rec: 100 },
    zel: { rate: 50, amount: 80 },
    ramp: 45,
  },
  // EXP vessels (M4-03F, GAME_DESIGN §6 → Growth fodder): one series per tier, on the evolution
  // material ladder by rarity (3★ Effigy stage 4, 4★ Cairn stage 6, 5★ Prism Cairn the chapter 1
  // clear): Flask 3★ opens on story stage 4, Alembic 4★ on stage 6, Athanor and Grail 5★ on the
  // chapter 1 clear, each with the ramp of that same-rarity material series. Armoured enemies.
  flask: {
    family: "flask",
    title: "Flask",
    place: "Cellar",
    gate: "story-04-rustwood-hollow",
    stats: { hp: 2000, atk: 500, def: 900, rec: 100 },
    zel: { rate: 50, amount: 50 },
    ramp: 0,
  },
  alembic: {
    family: "alembic",
    title: "Alembic",
    place: "Still",
    gate: "story-06-sunken-waystation",
    stats: { hp: 3500, atk: 1000, def: 1300, rec: 100 },
    zel: { rate: 50, amount: 80 },
    ramp: 10,
  },
  athanor: {
    family: "athanor",
    title: "Athanor",
    place: "Kiln",
    gate: CHAPTER_1_CLEAR,
    stats: { hp: 5000, atk: 1400, def: 1700, rec: 100 },
    zel: { rate: 50, amount: 120 },
    ramp: 25,
  },
  grail: {
    family: "grail",
    title: "Grail",
    place: "Chapel",
    gate: CHAPTER_1_CLEAR,
    stats: { hp: 6000, atk: 1600, def: 2000, rec: 100 },
    zel: { rate: 50, amount: 200 },
    ramp: 25,
  },
} as const satisfies Record<string, DungeonFamily>;

/** The elements `family` has a stage for: its one element if single-unit, else all six. */
export function familyElements(family: DungeonFamily): readonly Element[] {
  return family.single ? [family.single] : ELEMENTS;
}

/**
 * `stats` with a dungeon's difficulty ramp applied (RESOLVED-71): HP and ATK × (1 + ramp/100),
 * rounded; DEF and REC unchanged. Whatever builds a dungeon battle applies it to every enemy.
 */
export function rampedStats(stats: Stats, ramp: number | undefined): Stats {
  if (!ramp) return stats;
  return {
    ...stats,
    hp: Math.round((stats.hp * (100 + ramp)) / 100),
    atk: Math.round((stats.atk * (100 + ramp)) / 100),
  };
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** The material unit's name, e.g. "Cinder Sprite" or "Prism Cairn". */
function materialName(family: DungeonFamily, element: Element): string {
  if (family.single) return family.title;
  return `${capitalize(ELEMENT_PREFIXES[element])} ${family.title}`;
}

/** The material unit of `family` in `element`, e.g. `cinder-sprite`. */
export function materialUnitId(family: DungeonFamily, element: Element): string {
  if (family.single) return family.family;
  return `${ELEMENT_PREFIXES[element]}-${family.family}`;
}

/** The capturable enemy standing in for a material unit: `dg-<unit>`, e.g. `dg-cinder-sprite`. */
export function materialEnemyId(family: DungeonFamily, element: Element): string {
  return `dg-${materialUnitId(family, element)}`;
}

/** The dungeon stage of `family` in `element`: `dungeon-<unit>`, e.g. `dungeon-cinder-sprite`. */
export function dungeonStageId(family: DungeonFamily, element: Element): string {
  return `dungeon-${materialUnitId(family, element)}`;
}

/**
 * The material enemy of `family` in `element`: named like its unit, with the family's stats, a
 * two-hit normal attack, and a capture drop of its unit at {@link DUNGEON_CAPTURE_RATE}%.
 */
export function materialEnemy(family: DungeonFamily, element: Element): Enemy {
  return {
    id: materialEnemyId(family, element),
    name: materialName(family, element),
    element,
    stats: { ...family.stats },
    normalAttack: {
      moveType: "melee",
      startDelayFrames: 20,
      hitFrames: [0, 12],
      damageDistribution: [50, 50],
      dropChecks: 0,
    },
    skills: [],
    ai: [{ when: "default", skill: "normal", target: "random" }],
    drops: {
      bcResistance: 0.05,
      zel: { ...family.zel },
      capture: { unit: materialUnitId(family, element), rate: DUNGEON_CAPTURE_RATE },
    },
  };
}

/**
 * The dungeon stage of `family` in `element` (RESOLVED-70): 3 waves of the element's material
 * enemy (M) and chapter 1 companion mob (C), all of that element — wave 1 `M M`, wave 2 `C M C`,
 * wave 3 `C M C` with the middle material always captured. A family's `ramp` is carried on the
 * stage's `dungeon.ramp`.
 */
export function dungeonStage(family: DungeonFamily, element: Element): Stage {
  const material = materialEnemyId(family, element);
  const mob = CHAPTER_1_DUNGEON_MOBS[element];
  return {
    id: dungeonStageId(family, element),
    name: `${materialName(family, element)} ${family.place}`,
    dungeon: {
      series: family.family,
      gate: family.gate,
      ...(family.ramp > 0 ? { ramp: family.ramp } : {}),
    },
    waves: [
      { enemies: [{ enemy: material }, { enemy: material }] },
      { enemies: [{ enemy: mob }, { enemy: material }, { enemy: mob }] },
      { enemies: [{ enemy: mob }, { enemy: material, capture: "always" }, { enemy: mob }] },
    ],
  };
}

/** The Crown Shard stage's ID; it sits in the Colossus series (GAME_DESIGN §7 → Farming dungeons). */
export const CROWN_SHARD_STAGE_ID = "dungeon-crown-shard";

/** Chance in percent of a Crown Shard on each clear after the first (RESOLVED-70). */
export const KEY_ITEM_RATE = 20;

/**
 * The Crown Shard stage (RESOLVED-70, RESOLVED-71): in the Colossus series with its gate and ramp,
 * 1 Crown Shard on first clear and then {@link KEY_ITEM_RATE}% per clear. It has no material
 * enemies: its 3 waves are the chapter 1 dungeon mobs, all six elements — wave 1 Fire, Water,
 * Earth; wave 2 Thunder, Light, Dark; wave 3 Earth, Light, Dark.
 */
export function crownShardStage(): Stage {
  const colossus = DUNGEON_FAMILIES.colossus;
  const mobs = (elements: readonly Element[]) =>
    elements.map((element) => ({ enemy: CHAPTER_1_DUNGEON_MOBS[element] }));
  return {
    id: CROWN_SHARD_STAGE_ID,
    name: "Crown Shard Sanctum",
    dungeon: {
      series: colossus.family,
      gate: colossus.gate,
      keyItem: { item: "crown-shard", rate: KEY_ITEM_RATE },
      ramp: colossus.ramp,
    },
    waves: [
      { enemies: mobs(["fire", "water", "earth"]) },
      { enemies: mobs(["thunder", "light", "dark"]) },
      { enemies: mobs(["earth", "light", "dark"]) },
    ],
  };
}

/** Trial 1's stage, whose first clear opens the Zenith Core series (RESOLVED-69). */
export const TRIAL_1 = "trial-01-captain-locke";

/** The Zenith Core stage's ID; it is the one stage of its own series (GAME_DESIGN §7). */
export const ZENITH_CORE_STAGE_ID = "dungeon-zenith-core";

/** The Zenith Core series' difficulty ramp into Omni (RESOLVED-71). */
export const ZENITH_CORE_RAMP = 65;

/**
 * The Zenith Core stage (RESOLVED-69, RESOLVED-70, RESOLVED-71): the one stage of the
 * `zenith-core` series, gated on the Trial 1 first clear, with a +65% ramp and 1 Zenith Core on
 * first clear, then {@link KEY_ITEM_RATE}% per clear. Like the Crown Shard stage it has no
 * material enemies, only the chapter 1 dungeon mobs: wave 1 Fire, Water, Earth; wave 2 Thunder,
 * Light, Dark; wave 3 Water, Light, Dark.
 */
export function zenithCoreStage(): Stage {
  const mobs = (elements: readonly Element[]) =>
    elements.map((element) => ({ enemy: CHAPTER_1_DUNGEON_MOBS[element] }));
  return {
    id: ZENITH_CORE_STAGE_ID,
    name: "Zenith Core Spire",
    dungeon: {
      series: "zenith-core",
      gate: TRIAL_1,
      keyItem: { item: "zenith-core", rate: KEY_ITEM_RATE },
      ramp: ZENITH_CORE_RAMP,
    },
    waves: [
      { enemies: mobs(["fire", "water", "earth"]) },
      { enemies: mobs(["thunder", "light", "dark"]) },
      { enemies: mobs(["water", "light", "dark"]) },
    ],
  };
}

// Battle item series (M4-03G, RESOLVED-70): one stage per battle item, gated on the story ladder by
// how early the original let a player craft the item (GAME_DESIGN §7 → Farming dungeons → Item
// series). Each stage's waves are `C H C` three times: H is the item's carrier, the one enemy that
// drops it, and C is that stage element's chapter 1 dungeon mob. No ramp: the series sits below the
// 5★ material tier. Numbers are BFR tuning, not source values.

/** The battle item series' ID (one series, one stage per item). */
export const ITEM_SERIES = "items";

/** One battle item's farming stage. */
export interface ItemDungeon {
  /** The `content/items/` battle item the stage's carrier drops. */
  readonly item: string;
  /** The item's display name (must match its content file), used for the carrier and stage. */
  readonly title: string;
  /** The stage's element: its carrier's and companion mobs'. */
  readonly element: Element;
  /** The story stage whose first clear opens the stage. */
  readonly gate: string;
  /** Chance in percent that a defeated carrier drops the item (3 carriers per clear). */
  readonly rate: number;
}

/** The battle item stages, in the order the series lists them. */
export const ITEM_DUNGEONS: readonly ItemDungeon[] = [
  {
    item: "dew-tonic",
    title: "Dew Tonic",
    element: "water",
    gate: "story-04-rustwood-hollow",
    rate: 50,
  },
  {
    item: "bitterleaf",
    title: "Bitterleaf",
    element: "earth",
    gate: "story-04-rustwood-hollow",
    rate: 50,
  },
  {
    item: "rekindle-ash",
    title: "Rekindle Ash",
    element: "fire",
    gate: "story-04-rustwood-hollow",
    rate: 30,
  },
  {
    item: "bright-tonic",
    title: "Bright Tonic",
    element: "light",
    gate: "story-06-sunken-waystation",
    rate: 40,
  },
  {
    item: "valor-draught",
    title: "Valor Draught",
    element: "thunder",
    gate: "story-06-sunken-waystation",
    rate: 30,
  },
  { item: "grand-tonic", title: "Grand Tonic", element: "dark", gate: CHAPTER_1_CLEAR, rate: 30 },
];

/** An item stage's carrier enemy: `dg-item-<item>`, e.g. `dg-item-dew-tonic`. */
export function itemCarrierId(entry: ItemDungeon): string {
  return `dg-item-${entry.item}`;
}

/** An item stage's ID: `dungeon-item-<item>`, e.g. `dungeon-item-dew-tonic`. */
export function itemStageId(entry: ItemDungeon): string {
  return `dungeon-item-${entry.item}`;
}

/**
 * The carrier of `entry`'s item ("<item> Hoarder"): a soft, single-hit enemy of the stage's
 * element that drops the item at the entry's `rate`% and Zel, and is never captured.
 */
export function itemCarrier(entry: ItemDungeon): Enemy {
  return {
    id: itemCarrierId(entry),
    name: `${entry.title} Hoarder`,
    element: entry.element,
    stats: { hp: 3000, atk: 600, def: 400, rec: 100 },
    normalAttack: {
      moveType: "melee",
      startDelayFrames: 16,
      hitFrames: [0],
      damageDistribution: [100],
      dropChecks: 0,
    },
    skills: [],
    ai: [{ when: "default", skill: "normal", target: "random" }],
    drops: {
      bcResistance: 0.05,
      zel: { rate: 50, amount: 30 },
      items: [{ item: entry.item, rate: entry.rate }],
    },
  };
}

/**
 * The stage of `entry` ("<item> Cache"): 3 waves of `C H C` (H the carrier, C the element's
 * chapter 1 dungeon mob), in the `items` series at the entry's gate, no ramp, no key item.
 */
export function itemStage(entry: ItemDungeon): Stage {
  const carrier = itemCarrierId(entry);
  const mob = CHAPTER_1_DUNGEON_MOBS[entry.element];
  const wave = () => ({ enemies: [{ enemy: mob }, { enemy: carrier }, { enemy: mob }] });
  return {
    id: itemStageId(entry),
    name: `${entry.title} Cache`,
    dungeon: { series: ITEM_SERIES, gate: entry.gate },
    waves: [wave(), wave(), wave()],
  };
}

/** Hob series (M4-03I); elements follow the existing stackable units. */
export const HOB_DUNGEONS = [
  { unit: "vital-hob", title: "Vital Hob", element: "light" },
  { unit: "might-hob", title: "Might Hob", element: "light" },
  { unit: "ward-hob", title: "Ward Hob", element: "light" },
  { unit: "mend-hob", title: "Mend Hob", element: "light" },
] as const;

export function hobEnemy(entry: { unit: string; title: string; element: Element }): Enemy {
  const result = materialEnemy(
    {
      family: entry.unit,
      title: entry.title,
      single: entry.element,
      place: "Warren",
      gate: TRIAL_1,
      ramp: 0,
      stats: { hp: 8000, atk: 1700, def: 1500, rec: 100 },
      zel: { rate: 50, amount: 100 },
    },
    entry.element,
  );
  if (entry.unit === "grand-hob") result.drops.capture = { unit: entry.unit, rate: 100 };
  return result;
}

export const GRAND_HOB = { unit: "grand-hob", title: "Grand Hob", element: "light" } as const;

export function hobStage(entry: (typeof HOB_DUNGEONS)[number]): Stage {
  const stage = dungeonStage(
    {
      family: entry.unit,
      title: entry.title,
      single: entry.element,
      place: "Warren",
      gate: TRIAL_1,
      ramp: 0,
      stats: { hp: 8000, atk: 1700, def: 1500, rec: 100 },
      zel: { rate: 50, amount: 100 },
    },
    entry.element,
  );
  stage.dungeon = {
    series: "hobs",
    gate: TRIAL_1,
    dailyLimit: 5,
    rareSpawn: { enemy: "dg-grand-hob", replaces: `dg-${entry.unit}`, rateBp: 1500 },
  };
  return stage;
}

// Toad series (M4-03K, RESOLVED-71, RESOLVED-72): one stage, opening on the Trial 2 first clear,
// in the chapter 2 dungeon theme (the Lantern Grotto, a glowing sea cave on the Saltglass Coast).
// Lantern Toads are the material enemy on the template's layout (25% in waves 1–2, the final
// wave's always captured); a Matriarch Toad (10%) or Regent Toad (20%) replaces the final-wave
// Lantern Toad, always captured. No ramp (the toads are 3★ and 4★) and no daily limit. Numbers
// are BFR tuning for GAME_DESIGN §5's Trial 2 reference squad, not source values.

/** Trial 2's stage, whose first clear opens the toad series (RESOLVED-71). */
export const TRIAL_2 = "trial-02-master-ozric";

/** The toad series' ID and its one stage. */
export const TOAD_SERIES = "toads";
export const TOAD_STAGE_ID = "dungeon-lantern-toad";

/** The toad enemies: the capturable Lantern Toad and the two rare final-wave spawns. */
export const TOAD_ENEMIES = [
  { unit: "lantern-toad", title: "Lantern Toad", element: "fire", rate: DUNGEON_CAPTURE_RATE },
  { unit: "regent-toad", title: "Regent Toad", element: "fire", rate: 100 },
  { unit: "matriarch-toad", title: "Matriarch Toad", element: "light", rate: 100 },
] as const satisfies readonly { unit: string; title: string; element: Element; rate: number }[];

/** Per-clear chance of each rare final-wave toad, in basis points, in band order (RESOLVED-71). */
export const TOAD_FINAL_SPAWNS = [
  { enemy: "dg-matriarch-toad", replaces: "dg-lantern-toad", rateBp: 1000 },
  { enemy: "dg-regent-toad", replaces: "dg-lantern-toad", rateBp: 2000 },
] as const;

/** A toad enemy: `dg-<unit>`, a two-hit melee material enemy capturing its unit at `rate`%. */
export function toadEnemy(entry: (typeof TOAD_ENEMIES)[number]): Enemy {
  const result = materialEnemy(
    {
      family: entry.unit,
      title: entry.title,
      single: entry.element,
      place: "Grotto",
      gate: TRIAL_2,
      ramp: 0,
      stats: { hp: 20000, atk: 4000, def: 1800, rec: 100 },
      zel: { rate: 50, amount: 150 },
    },
    entry.element,
  );
  result.drops.capture = { unit: entry.unit, rate: entry.rate };
  return result;
}

/**
 * The chapter 2 dungeon companion mobs (RESOLVED-72), original Lantern Grotto designs used by the
 * toad series: Vent Shrimp (Fire; every third turn Scald Spout, a 0.5× AoE), Brine Urchin (Water;
 * every third turn Spine Shell, +50% DEF for 2 turns), Glass Jelly (Thunder; every fourth turn
 * Lamp Sting, a 1.3× single hit on the lowest-HP unit). Sprites are M6-07N.
 */
export function chapter2DungeonMobs(): Enemy[] {
  const base = {
    stats: { hp: 14000, atk: 3200, def: 600, rec: 100 },
    drops: { bcResistance: 0.05, zel: { rate: 60, amount: 60 } },
  };
  return [
    {
      id: "dg2-vent-shrimp",
      name: "Vent Shrimp",
      element: "fire",
      ...structuredClone(base),
      normalAttack: {
        moveType: "melee",
        startDelayFrames: 18,
        hitFrames: [0, 8, 16],
        damageDistribution: [30, 30, 40],
        dropChecks: 0,
      },
      skills: [
        {
          id: "scald-spout",
          name: "Scald Spout",
          attacks: [
            {
              moveType: "ranged",
              startDelayFrames: 28,
              hitFrames: [0, 8, 16],
              damageDistribution: [30, 30, 40],
              dropChecks: 0,
            },
          ],
          effects: [{ id: "attack.aoe", value: 0.5, target: "enemies" }],
        },
      ],
      ai: [
        { when: "every_n_turns", n: 3, skill: "scald-spout", target: "random" },
        { when: "default", skill: "normal", target: "random" },
      ],
    },
    {
      id: "dg2-brine-urchin",
      name: "Brine Urchin",
      element: "water",
      ...structuredClone(base),
      normalAttack: {
        moveType: "ranged",
        startDelayFrames: 24,
        hitFrames: [0, 10],
        damageDistribution: [50, 50],
        dropChecks: 0,
      },
      skills: [
        {
          id: "spine-shell",
          name: "Spine Shell",
          attacks: [],
          effects: [{ id: "buff.def", value: 0.5, turns: 2, target: "self" }],
        },
      ],
      ai: [
        { when: "every_n_turns", n: 3, skill: "spine-shell", target: "random" },
        { when: "default", skill: "normal", target: "random" },
      ],
    },
    {
      id: "dg2-glass-jelly",
      name: "Glass Jelly",
      element: "thunder",
      ...structuredClone(base),
      normalAttack: {
        moveType: "ranged",
        startDelayFrames: 20,
        hitFrames: [0],
        damageDistribution: [100],
        dropChecks: 0,
      },
      skills: [
        {
          id: "lamp-sting",
          name: "Lamp Sting",
          attacks: [
            {
              moveType: "melee",
              startDelayFrames: 22,
              hitFrames: [0, 10],
              damageDistribution: [50, 50],
              dropChecks: 0,
            },
          ],
          effects: [{ id: "attack.st", value: 1.3, target: "enemy" }],
        },
      ],
      ai: [
        { when: "every_n_turns", n: 4, skill: "lamp-sting", target: "lowest_hp" },
        { when: "default", skill: "normal", target: "random" },
      ],
    },
  ];
}

/**
 * The toad series' stage ("Lantern Toad Grotto"): wave 1 `L L`, wave 2 `U L J`, wave 3 `S L J`
 * with the final Lantern Toad always captured (L Lantern Toad, S Vent Shrimp, U Brine Urchin,
 * J Glass Jelly), and the rare final-wave toads in `dungeon.finalSpawns`.
 */
export function toadStage(): Stage {
  const lantern = "dg-lantern-toad";
  return {
    id: TOAD_STAGE_ID,
    name: "Lantern Toad Grotto",
    dungeon: {
      series: TOAD_SERIES,
      gate: TRIAL_2,
      finalSpawns: TOAD_FINAL_SPAWNS.map((entry) => ({ ...entry })),
    },
    waves: [
      { enemies: [{ enemy: lantern }, { enemy: lantern }] },
      {
        enemies: [{ enemy: "dg2-brine-urchin" }, { enemy: lantern }, { enemy: "dg2-glass-jelly" }],
      },
      {
        enemies: [
          { enemy: "dg2-vent-shrimp" },
          { enemy: lantern, capture: "always" },
          { enemy: "dg2-glass-jelly" },
        ],
      },
    ],
  };
}

/**
 * Resolve one rare encounter from a server-issued unsigned 32-bit seed, separately from combat
 * RNG. Low base-10000 digit selects the per-entry rate; the next digit selects the wave. The
 * modulo bias from 2^32 is negligible (< 0.000003 per bucket). Matches SQL dungeon_waves exactly.
 * The first matching regular enemy in the selected wave is replaced; its capture marker remains.
 * A Grand Hob's enemy capture rate is 100%, including in waves 1–2. A stage with `finalSpawns`
 * (the toad series) instead walks consecutive basis-point bands of the same low digit, in list
 * order, and replaces the first matching slot of the final wave with the band's enemy.
 */
export function dungeonWaves(stage: Stage, seed: number): Stage["waves"] {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError("dungeon seed must be an unsigned 32-bit integer");
  }
  const finals = stage.dungeon?.finalSpawns;
  if (finals) {
    let band = 0;
    const roll = seed % 10000;
    const hit = finals.find((entry) => {
      band += entry.rateBp;
      return roll < band;
    });
    if (!hit) return stage.waves;
    return replaceIn(stage.waves, stage.waves.length - 1, hit.replaces, hit.enemy);
  }
  const rare = stage.dungeon?.rareSpawn;
  if (!rare || seed % 10000 >= rare.rateBp) return stage.waves;
  return replaceIn(
    stage.waves,
    Math.floor(seed / 10000) % stage.waves.length,
    rare.replaces,
    rare.enemy,
  );
}

/** `waves` with the first `replaces` slot of wave `index` swapped for `enemy` (a new array). */
function replaceIn(
  waves: Stage["waves"],
  index: number,
  replaces: string,
  enemy: string,
): Stage["waves"] {
  return waves.map((wave, w) => {
    if (w !== index) return wave;
    const slot = wave.enemies.findIndex((s) => s.enemy === replaces);
    if (slot < 0) throw new Error("rare-spawn replacement candidate is missing");
    return { ...wave, enemies: wave.enemies.map((s, e) => (e === slot ? { ...s, enemy } : s)) };
  });
}
