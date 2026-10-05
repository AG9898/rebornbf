import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildQuestMap, STORY_STAGES } from "../../lib/quests/quest-map.ts";
import { regionAreaPlates } from "../../lib/quests/region-areas.ts";
import { REGION_MAPS } from "../../lib/quests/region-maps.ts";
import { RegionMap } from "./RegionMap.tsx";

function render(clearedCount: number): string {
  const map = REGION_MAPS[0];
  if (!map) throw new Error("Missing Brightmere Vale");
  const cleared = new Set(STORY_STAGES.slice(0, clearedCount).map((stage) => stage.id));
  return renderToStaticMarkup(
    createElement(RegionMap, {
      map,
      plates: regionAreaPlates(map, buildQuestMap(cleared)),
      backHref: "/home",
    }),
  );
}

describe("region map screen (M3-04M)", () => {
  it("draws the map, Back, and the region plate named Brightmere Vale", () => {
    const html = render(0);
    expect(html).toContain("/assets/maps/brightmere-vale.webp");
    expect(html).toContain('href="/home"');
    expect(html).toContain("assets/ui/region-plate.webp");
    expect(html).toMatch(/<h1[^>]*>Brightmere Vale<\/h1>/);
  });

  it("puts a plate only on open areas, with NEW AREA until the first quest is cleared", () => {
    const fresh = render(0);
    expect(fresh.match(/assets\/ui\/area-plate\.webp/g)).toHaveLength(1);
    expect(fresh).toContain('href="/quests/1"');
    expect(fresh).not.toContain('href="/quests/2"');
    expect(fresh).toContain("NEW AREA");
    expect(fresh).toContain("0/8");

    const both = render(8);
    expect(both.match(/assets\/ui\/area-plate\.webp/g)).toHaveLength(2);
    expect(both.match(/NEW AREA/g)).toHaveLength(1);
    expect(both).toContain('href="/quests/2"');
    expect(both).toContain("8/8");
  });
});
