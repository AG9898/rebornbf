import { DUNGEON_FAMILIES, MaterialItemSchema, type Stage } from "@bfr/data";
import crownShard from "@bfr/data/content/items/crown-shard.json";
import zenithCore from "@bfr/data/content/items/zenith-core.json";
import type { StageListEntry } from "../../components/quests/StageList.tsx";
import { formArtFile, unitContent } from "../units/owned-units.ts";
import { DUNGEON_ENEMIES, DUNGEON_STAGES } from "./dungeon-content.ts";
import { BATTLE_ITEMS } from "./item-loadout.ts";
import { STORY_STAGES } from "./quest-map.ts";
import { TRIAL_STAGES } from "./trials.ts";

export { DUNGEON_ENEMIES, DUNGEON_STAGES } from "./dungeon-content.ts";

/** The five Vortex categories; growth includes both launch hob and toad series. */
export const DUNGEON_CATEGORIES = [
  {
    id: "evolution-materials",
    title: "Evolution Materials",
    type: "Materials",
    series: [
      "sprite",
      "effigy",
      "mote",
      "cairn",
      "prism-cairn",
      "wyrm-coffer",
      "colossus",
      "glint-urn",
      "dusk-urn",
    ],
  },
  {
    id: "fusion-vessels",
    title: "Fusion Vessels",
    type: "Fusion",
    series: ["flask", "alembic", "athanor", "grail"],
  },
  { id: "hob-warrens", title: "Hob Warrens", type: "Growth", series: ["hobs", "toads"] },
  { id: "item-caches", title: "Item Caches", type: "Battle Items", series: ["items"] },
  {
    id: "zenith-core-spire",
    title: "Zenith Core Spire",
    type: "Evolution",
    series: ["zenith-core"],
  },
] as const;

export type DungeonCategory = (typeof DUNGEON_CATEGORIES)[number];
export type DailyDungeonRow = {
  series: string;
  daily_limit: number;
  clears_today: number;
  clears_left: number;
};
export type DungeonSeriesView = {
  id: string;
  title: string;
  category: DungeonCategory;
  stages: StageListEntry[];
  locked: boolean;
  gateText: string;
  leftToday?: number;
  sprite: string;
};

const OTHER_TITLES: Readonly<Record<string, string>> = {
  hobs: "Hob Warrens",
  toads: "Lantern Toad Grotto",
  items: "Item Caches",
  "zenith-core": "Zenith Core Spire",
};
const ITEMS = new Map(
  [...BATTLE_ITEMS, MaterialItemSchema.parse(crownShard), MaterialItemSchema.parse(zenithCore)].map(
    (item) => [item.id, item],
  ),
);
const ENEMIES = new Map(DUNGEON_ENEMIES.map((enemy) => [enemy.id, enemy]));

export function dungeonStage(stageId: string): Stage | undefined {
  return DUNGEON_STAGES.find((stage) => stage.id === stageId);
}

export function dungeonCategory(id: string): DungeonCategory | undefined {
  return DUNGEON_CATEGORIES.find((category) => category.id === id);
}

export function dungeonSeriesTitle(id: string): string {
  return (
    (DUNGEON_FAMILIES as Readonly<Record<string, { title: string }>>)[id]?.title ??
    OTHER_TITLES[id] ??
    id
  );
}

/** Content gate names, including trial gates and differently gated item stages. */
export function dungeonGateText(gate: string): string {
  const story = STORY_STAGES.find((stage) => stage.id === gate);
  if (story) return `Clear story stage ${story.story?.number}, ${story.name}, to open.`;
  const trial = TRIAL_STAGES.find((stage) => stage.id === gate);
  return trial ? `Clear ${trial.name} to open.` : `Clear ${gate} to open.`;
}

/** Capture/drop previews derive from the same enemy and stage content as settlement. */
export function dungeonRewardsText(stage: Stage): string {
  const units = new Set<string>();
  const items = new Set<string>();
  const enemyIds = [
    ...stage.waves.flatMap((wave) => wave.enemies.map((slot) => slot.enemy)),
    ...(stage.dungeon?.rareSpawn ? [stage.dungeon.rareSpawn.enemy] : []),
    ...(stage.dungeon?.finalSpawns?.map((spawn) => spawn.enemy) ?? []),
  ];
  for (const id of enemyIds) {
    const drops = ENEMIES.get(id)?.drops;
    if (drops?.capture) units.add(unitContent(drops.capture.unit)?.name ?? drops.capture.unit);
    for (const drop of drops?.items ?? []) items.add(ITEMS.get(drop.item)?.name ?? drop.item);
  }
  if (stage.dungeon?.keyItem)
    items.add(ITEMS.get(stage.dungeon.keyItem.item)?.name ?? stage.dungeon.keyItem.item);
  return [
    units.size ? `Captures: ${[...units].join(", ")}.` : "",
    items.size ? `Drops: ${[...items].join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Stand-ins use a series' material sprite, item carrier, or the Zenith Core icon. */
function seriesSprite(stages: readonly Stage[]): string {
  const stage = stages[0];
  if (stage?.dungeon?.keyItem?.item === "zenith-core") return "/assets/ui/item-zenith-core.webp";
  const ids = stages.flatMap((entry) =>
    entry.waves.flatMap((wave) => wave.enemies.map((slot) => slot.enemy)),
  );
  const capture = ids.map((id) => ENEMIES.get(id)?.drops.capture).find(Boolean);
  if (capture) {
    const unit = unitContent(capture.unit);
    const form = unit?.forms[0];
    const art = form ? formArtFile(capture.unit, form.rarity) : null;
    if (art) return `/assets/units/${capture.unit}/battle-idle-${art}.png`;
  }
  const carrier = ids.find((id) => id.startsWith("dg-item-"));
  return `/assets/enemies/${carrier ?? "dg1-gleam-crab"}/battle-idle.png`;
}

/** Client display only; start_battle rechecks the gate and UTC-day limit at entry. */
export function buildDungeonList(
  cleared: ReadonlySet<string>,
  daily: readonly DailyDungeonRow[] = [],
): DungeonSeriesView[] {
  return DUNGEON_CATEGORIES.flatMap((category) =>
    category.series.map((id) => {
      const content = DUNGEON_STAGES.filter((stage) => stage.dungeon?.series === id);
      const limit = content[0]?.dungeon?.dailyLimit;
      const remaining = daily.find((row) => row.series === id)?.clears_left;
      // Missing daily data never invents available entries for a limited series.
      const leftToday =
        limit === undefined ? undefined : Math.max(0, Math.min(limit, remaining ?? 0));
      const locked = content.every((stage) => !cleared.has(stage.dungeon?.gate ?? ""));
      const gateText = [
        ...new Set(content.map((stage) => dungeonGateText(stage.dungeon?.gate ?? ""))),
      ].join(" ");
      return {
        id,
        title: dungeonSeriesTitle(id),
        category,
        locked,
        gateText,
        leftToday,
        sprite: seriesSprite(content),
        stages: content.map((stage) => ({
          id: stage.id,
          name: stage.name,
          waves: stage.waves.length,
          state: !cleared.has(stage.dungeon?.gate ?? "")
            ? "locked"
            : cleared.has(stage.id)
              ? "cleared"
              : "open",
          text: !cleared.has(stage.dungeon?.gate ?? "")
            ? dungeonGateText(stage.dungeon?.gate ?? "")
            : "Defeat the dungeon's enemies to collect its rewards.",
          rewards: dungeonRewardsText(stage),
          ...(leftToday === undefined ? {} : { leftToday }),
        })),
      };
    }),
  );
}
