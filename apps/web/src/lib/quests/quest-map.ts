import { isBossStage, type Stage, StageSchema } from "@bfr/data";
import story01 from "@bfr/data/content/stages/story-01-brightmere-outskirts.json";
import story02 from "@bfr/data/content/stages/story-02-mistfen-crossing.json";
import story03 from "@bfr/data/content/stages/story-03-old-kiln-road.json";
import story04 from "@bfr/data/content/stages/story-04-rustwood-hollow.json";
import story05 from "@bfr/data/content/stages/story-05-stormbreak-ridge.json";
import story06 from "@bfr/data/content/stages/story-06-sunken-waystation.json";
import story07 from "@bfr/data/content/stages/story-07-duskgate-stair.json";
import story08 from "@bfr/data/content/stages/story-08-beacon-hollow.json";

/**
 * The quest map (M3-04A): the story stages from `@bfr/data`, grouped by chapter, with each stage's
 * state from the player's `quest_progress` rows. Pure, so the page stays thin and this is testable.
 */

/** The `quest_progress` columns the quest map selects. */
export const QUEST_PROGRESS_COLUMNS = "stage_id";

export type QuestProgressRow = { stage_id: string };

/** Chapter titles for the story frame (GAME_DESIGN §7). */
export const CHAPTER_TITLES: Readonly<Record<number, string>> = {
  1: "The Ember Road",
};

/** `cleared` after a first clear; `open` when the previous story stage is cleared (or it is the first). */
export type StageState = "cleared" | "open" | "locked";

export type QuestStageView = {
  id: string;
  /** Story-wide stage number (chapter 1 is 1–8). */
  number: number;
  name: string;
  text: string;
  boss: boolean;
  firstClearGems: number;
  state: StageState;
};

export type QuestChapterView = {
  number: number;
  title: string;
  stages: QuestStageView[];
  cleared: number;
};

/** Every story stage in story order. */
export const STORY_STAGES: readonly Stage[] = [
  story01,
  story02,
  story03,
  story04,
  story05,
  story06,
  story07,
  story08,
]
  .map((json) => StageSchema.parse(json))
  .filter((stage) => stage.story !== undefined)
  .sort((a, b) => (a.story?.number ?? 0) - (b.story?.number ?? 0));

/** Stage IDs the player has cleared, from their `quest_progress` rows. */
export function clearedStageIds(rows: readonly QuestProgressRow[]): ReadonlySet<string> {
  return new Set(rows.map((row) => row.stage_id));
}

/**
 * Chapters in order, each with its stages and their state. Story stages unlock in number order:
 * the first is always open, and each later one opens once the one before it is cleared.
 */
export function buildQuestMap(
  cleared: ReadonlySet<string>,
  stages: readonly Stage[] = STORY_STAGES,
): QuestChapterView[] {
  const chapters = new Map<number, QuestChapterView>();
  let previousCleared = true;
  for (const stage of stages) {
    const story = stage.story;
    if (!story) continue;
    const isCleared = cleared.has(stage.id);
    const state: StageState = isCleared ? "cleared" : previousCleared ? "open" : "locked";
    previousCleared = isCleared;

    let chapter = chapters.get(story.chapter);
    if (!chapter) {
      chapter = {
        number: story.chapter,
        title: CHAPTER_TITLES[story.chapter] ?? `Chapter ${story.chapter}`,
        stages: [],
        cleared: 0,
      };
      chapters.set(story.chapter, chapter);
    }
    chapter.stages.push({
      id: stage.id,
      number: story.number,
      name: stage.name,
      text: story.text,
      boss: isBossStage(stage),
      firstClearGems: stage.firstClear?.gems ?? 0,
      state,
    });
    if (isCleared) chapter.cleared++;
  }
  return [...chapters.values()].sort((a, b) => a.number - b.number);
}
