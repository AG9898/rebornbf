import { DUNGEON_FAMILIES, ITEM_SERIES, type Stage } from "@bfr/data";
import { CHAPTER_TITLES } from "../../lib/quests/quest-map.ts";

/**
 * The names the wave transition panel shows (RESOLVED-91 item 1, M2-07G): the area small on top
 * and the stage name in quotes below it.
 */
export interface StageNames {
  readonly area: string;
  readonly stage: string;
}

/** Display names of dungeon series that are not a material family (BFR naming). */
const SERIES_TITLES: Readonly<Record<string, string>> = {
  [ITEM_SERIES]: "Item",
  hobs: "Hob",
  toads: "Lantern Toad",
  "zenith-core": "Zenith Core",
};

/** A dungeon series' display name: its family or series title, then "Dungeon". */
export function seriesName(series: string): string {
  const family = (DUNGEON_FAMILIES as Readonly<Record<string, { readonly title: string }>>)[series];
  const title = family?.title ?? SERIES_TITLES[series];
  return title ? `${title} Dungeon` : "Dungeon";
}

/**
 * The panel names for a stage: the story chapter's title, the dungeon series' name, or "Trial";
 * any other stage (the demo, the tutorial) shows its own title as the area too.
 */
export function stageNames(stage: Pick<Stage, "name" | "story" | "dungeon" | "trial">): StageNames {
  const area = stage.story
    ? (CHAPTER_TITLES[stage.story.chapter] ?? `Chapter ${stage.story.chapter}`)
    : stage.dungeon
      ? seriesName(stage.dungeon.series)
      : stage.trial
        ? "Trial"
        : stage.name;
  return { area, stage: stage.name };
}
