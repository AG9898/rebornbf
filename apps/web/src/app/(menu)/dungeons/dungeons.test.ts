import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDungeonList, DUNGEON_STAGES } from "../../../lib/quests/dungeons.ts";
import DungeonSeriesPage from "./[series]/page.tsx";
import DungeonCategoryPage from "./category/[category]/page.tsx";
import DungeonsPage from "./page.tsx";

const { progress } = vi.hoisted(() => ({ progress: vi.fn() }));
vi.mock("../../../server/quest-progress.ts", () => ({ dungeonProgress: progress }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not-found");
  },
}));

beforeEach(() => {
  progress.mockResolvedValue({
    series: buildDungeonList(new Set(DUNGEON_STAGES.map((stage) => stage.dungeon?.gate ?? "")), [
      { series: "hobs", daily_limit: 5, clears_today: 5, clears_left: 0 },
    ]),
    signedIn: true,
    failed: false,
  });
});

describe("dungeon route integration (M4-03)", () => {
  it("opens five category banners, with multi-series lists and direct single-series stage lists", async () => {
    const html = renderToStaticMarkup(await DungeonsPage());
    expect(html.match(/assets\/ui\/dungeon-banner-frame.webp/g)).toHaveLength(5);
    expect(html).toContain('href="/dungeons/category/evolution-materials"');
    expect(html).toContain('href="/dungeons/category/hob-warrens"');
    expect(html).toContain('href="/dungeons/items"');
    expect(html).toContain('href="/dungeons/zenith-core"');
    const growth = renderToStaticMarkup(
      await DungeonCategoryPage({ params: Promise.resolve({ category: "hob-warrens" }) }),
    );
    expect(growth).toContain('href="/dungeons/hobs"');
    expect(growth).toContain('href="/dungeons/toads"');
    expect(growth).toContain("Left 0 today");
  });

  it("disables exhausted hob starts, preserves rewards and vortex, and permits unlimited toads", async () => {
    const hobs = renderToStaticMarkup(
      await DungeonSeriesPage({ params: Promise.resolve({ series: "hobs" }) }),
    );
    expect(hobs).toContain('data-backdrop="vortex"');
    expect(hobs).toContain("Grand Hob");
    expect(hobs.match(/Left 0 today/g)).toHaveLength(4);
    expect(hobs).not.toContain('href="/start/');
    const toads = renderToStaticMarkup(
      await DungeonSeriesPage({ params: Promise.resolve({ series: "toads" }) }),
    );
    expect(toads).toContain('href="/start/dungeon-lantern-toad"');
  });

  it("shows gates for locked series and suppresses entry links when signed out or reads fail", async () => {
    progress.mockResolvedValue({
      series: buildDungeonList(new Set()),
      signedIn: false,
      failed: false,
    });
    const html = renderToStaticMarkup(await DungeonsPage());
    expect(html).toContain("Sign in");
    expect(html).toContain("Captain Locke");
    expect(html.match(/data-locked="true"/g)).toHaveLength(5);
    const locked = renderToStaticMarkup(
      await DungeonSeriesPage({ params: Promise.resolve({ series: "toads" }) }),
    );
    expect(locked).toContain("Master Ozric");
    expect(locked).not.toContain('href="/start/');
    progress.mockResolvedValue({
      series: buildDungeonList(new Set(DUNGEON_STAGES.map((stage) => stage.dungeon?.gate ?? ""))),
      signedIn: true,
      failed: true,
    });
    const failed = renderToStaticMarkup(
      await DungeonSeriesPage({ params: Promise.resolve({ series: "sprite" }) }),
    );
    expect(failed).toContain('role="alert"');
    expect(failed).not.toContain('href="/start/');
  });

  it("404s unknown category and series paths", async () => {
    await expect(
      DungeonCategoryPage({ params: Promise.resolve({ category: "missing" }) }),
    ).rejects.toThrow("not-found");
    await expect(
      DungeonSeriesPage({ params: Promise.resolve({ series: "missing" }) }),
    ).rejects.toThrow("not-found");
  });
});
