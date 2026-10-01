import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildQuestMap, STORY_STAGES } from "../../lib/quests/quest-map.ts";
import { StageList } from "./StageList.tsx";

function render(playable = true, cleared = new Set<string>()): string {
  const chapter = buildQuestMap(cleared)[0];
  if (!chapter) throw new Error("Missing story chapter");
  return renderToStaticMarkup(
    createElement(StageList, {
      title: chapter.title,
      backHref: "/quests",
      stages: chapter.stages,
      playable,
    }),
  );
}

describe("shared stage list (M3-04L)", () => {
  it("shows chapter navigation, NEW, wave counts and flavour; only the open stage links to Reinforcement", () => {
    const html = render();
    expect(html).toContain('href="/quests"');
    expect(html).toContain('href="/home"');
    expect(html).toContain("The Ember Road");
    expect(html).toContain("NEW");
    expect(html).toContain(STORY_STAGES[0]?.story?.text);
    expect(html).toContain(`${STORY_STAGES[0]?.waves.length} waves`);
    expect(html.match(/href="\/start\//g)).toHaveLength(1);
    expect(html).toContain(`href="/start/${STORY_STAGES[0]?.id}"`);
    expect(html.match(/data-state="locked"/g)).toHaveLength(7);
    expect(html.match(/aria-disabled="true"/g)).toHaveLength(7);
  });

  it("uses quest_progress clears for CLEAR ribbons and replay links, then opens the next stage", () => {
    const html = render(true, new Set([STORY_STAGES[0]?.id ?? ""]));
    expect(html).toContain("CLEAR");
    expect(html).toContain("NEW");
    expect(html.match(/href="\/start\//g)).toHaveLength(2);
    expect(html).toContain(`href="/start/${STORY_STAGES[1]?.id}"`);
  });

  it("does not offer playable links when signed out or progress loading failed", () => {
    expect(render(false)).not.toContain('href="/start/');
  });

  it("supports daily-limited dungeon entries and disables an exhausted stage", () => {
    const html = renderToStaticMarkup(
      createElement(StageList, {
        title: "Dungeon",
        backHref: "/dungeons",
        playable: true,
        stages: [
          {
            id: "daily",
            name: "Daily stage",
            text: "Flavour",
            waves: 1,
            state: "open",
            leftToday: 0,
          },
        ],
      }),
    );
    expect(html).toContain("Left 0 today");
    expect(html).toContain("1 wave");
    expect(html).not.toContain('href="/start/');
  });
});
