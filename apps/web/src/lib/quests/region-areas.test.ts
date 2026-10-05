import { describe, expect, it } from "vitest";
import { buildQuestMap, STORY_STAGES } from "./quest-map.ts";
import { regionAreaPlates } from "./region-areas.ts";
import { REGION_MAPS, type RegionMap } from "./region-maps.ts";

function valeMap(): RegionMap {
  const map = REGION_MAPS[0];
  if (!map) throw new Error("Missing Brightmere Vale");
  return map;
}
const vale = valeMap();

function plates(clearedCount: number) {
  const cleared = new Set(STORY_STAGES.slice(0, clearedCount).map((stage) => stage.id));
  return regionAreaPlates(vale, buildQuestMap(cleared));
}

describe("region map area plates (M3-04M)", () => {
  it("shows only The Ember Road, as a new area, before any clear", () => {
    const [ember, ...rest] = plates(0);
    expect(rest).toEqual([]);
    expect(ember).toMatchObject({
      id: "ember-road",
      chapter: 1,
      title: "The Ember Road",
      href: "/quests/1",
      cleared: 0,
      total: 8,
      newArea: true,
    });
    expect(ember?.anchor).toEqual(vale.areas.find((area) => area.id === "ember-road")?.anchor);
  });

  it("drops NEW AREA once the area's first quest is cleared and counts clears", () => {
    expect(plates(3)).toEqual([expect.objectContaining({ cleared: 3, newArea: false })]);
  });

  it("opens The Saltglass Coast after stage 8, new until stage 9 is cleared", () => {
    expect(plates(7).map((plate) => plate.id)).toEqual(["ember-road"]);
    expect(plates(8)).toEqual([
      expect.objectContaining({ id: "ember-road", cleared: 8, newArea: false }),
      expect.objectContaining({ id: "saltglass-coast", href: "/quests/2", newArea: true }),
    ]);
    expect(plates(10)[1]).toMatchObject({ cleared: 2, total: 8, newArea: false });
  });

  it("never gives a planned area a plate", () => {
    const ids = plates(16).map((plate) => plate.id);
    expect(ids).toEqual(["ember-road", "saltglass-coast"]);
    expect(vale.areas.filter((area) => area.chapter === null)).toHaveLength(6);
  });
});
