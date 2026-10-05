import type { QuestChapterView } from "./quest-map.ts";
import type { RegionMap } from "./region-maps.ts";

/**
 * The region map's open areas (M3-04M, RESOLVED-93): each story chapter is one area of the painted
 * region, and only an open area gets a plate. Pure, so the page stays thin and this is testable.
 */
export type RegionAreaPlate = {
  id: string;
  chapter: number;
  title: string;
  /** The landmark the plate sits on, as fractions of the map's width and height. */
  anchor: { x: number; y: number };
  href: string;
  cleared: number;
  total: number;
  /** "NEW AREA" shows until the area's first quest is cleared. */
  newArea: boolean;
};

/**
 * The plates to draw on `map`: an area is open when its chapter's first stage is open or cleared
 * (chapter 2 opens once stage 8 is cleared). Planned areas (no chapter) and locked areas get none.
 */
export function regionAreaPlates(
  map: RegionMap,
  chapters: readonly QuestChapterView[],
): RegionAreaPlate[] {
  return map.areas.flatMap((area) => {
    if (area.chapter === null) return [];
    const chapter = chapters.find((entry) => entry.number === area.chapter);
    const first = chapter?.stages[0];
    if (!chapter || !first || first.state === "locked") return [];
    return [
      {
        id: area.id,
        chapter: chapter.number,
        title: chapter.title,
        anchor: area.anchor,
        href: `/quests/${chapter.number}`,
        cleared: chapter.cleared,
        total: chapter.stages.length,
        newArea: first.state !== "cleared",
      },
    ];
  });
}
