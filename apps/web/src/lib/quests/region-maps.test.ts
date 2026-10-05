import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHAPTER_TITLES } from "./quest-map.ts";
import { REGION_MAPS } from "./region-maps.ts";

describe("region maps (M6-07S)", () => {
  const [vale] = REGION_MAPS;

  it("paints Brightmere Vale's eight areas, every story chapter among them", () => {
    expect(vale?.name).toBe("Brightmere Vale");
    expect(vale?.areas).toHaveLength(8);
    const chapters = vale?.areas.flatMap((area) => (area.chapter === null ? [] : [area.chapter]));
    expect(chapters).toEqual(Object.keys(CHAPTER_TITLES).map(Number));
    expect(new Set(vale?.areas.map((area) => area.id)).size).toBe(8);
  });

  it("keeps every landmark anchor on the map and the export on disk", () => {
    for (const area of vale?.areas ?? []) {
      expect(area.anchor.x).toBeGreaterThan(0);
      expect(area.anchor.x).toBeLessThan(1);
      expect(area.anchor.y).toBeGreaterThan(0);
      expect(area.anchor.y).toBeLessThan(1);
    }
    expect(existsSync(new URL(`../../../public${vale?.src}`, import.meta.url))).toBe(true);
  });
});
