import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildDungeonList,
  DUNGEON_CATEGORIES,
  DUNGEON_ENEMIES,
  DUNGEON_STAGES,
} from "./dungeons.ts";

const gates = new Set(DUNGEON_STAGES.map((stage) => stage.dungeon?.gate ?? ""));

describe("launch dungeon map (M4-03)", () => {
  it("bundles every launch farming stage and enemy, with each series in exactly one of five categories", () => {
    const files = readdirSync(
      new URL("../../../../../packages/data/content/stages/", import.meta.url),
    );
    expect(DUNGEON_STAGES.map((stage) => `${stage.id}.json`).sort()).toEqual(
      files.filter((file) => file.startsWith("dungeon-")).sort(),
    );
    const enemies = readdirSync(
      new URL("../../../../../packages/data/content/enemies/", import.meta.url),
    );
    expect(DUNGEON_ENEMIES.map((enemy) => `${enemy.id}.json`).sort()).toEqual(
      enemies.filter((file) => file.startsWith("dg")).sort(),
    );
    expect(DUNGEON_CATEGORIES).toHaveLength(5);
    const ids = DUNGEON_CATEGORIES.flatMap((category) => [...category.series]);
    expect(ids).toHaveLength(new Set(ids).size);
    expect([...ids].sort()).toEqual(
      [...new Set(DUNGEON_STAGES.map((stage) => stage.dungeon?.series))].sort(),
    );
    expect(ids).not.toContain("sp");
  });

  it("shows content gate names, including Trial 1 and Trial 2, and unlocks stages independently", () => {
    const locked = buildDungeonList(new Set());
    expect(
      locked.every(
        (series) => series.locked && series.stages.every((stage) => stage.state === "locked"),
      ),
    ).toBe(true);
    expect(locked.find((series) => series.id === "toads")?.gateText).toContain(
      "Trial 2: Master Ozric",
    );
    expect(locked.find((series) => series.id === "hobs")?.gateText).toContain(
      "Trial 1: Captain Locke",
    );
    const map = buildDungeonList(new Set(["story-04-rustwood-hollow", "dungeon-cinder-sprite"]));
    expect(
      map
        .find((series) => series.id === "sprite")
        ?.stages.find((stage) => stage.id === "dungeon-cinder-sprite")?.state,
    ).toBe("cleared");
    expect(map.find((series) => series.id === "sprite")?.locked).toBe(false);
    expect(
      map.find((series) => series.id === "items")?.stages.filter((stage) => stage.state === "open"),
    ).toHaveLength(3);
    expect(
      map
        .find((series) => series.id === "items")
        ?.stages.filter((stage) => stage.state === "locked"),
    ).toHaveLength(3);
  });

  it("shares the server's daily remaining count across every hob stage and fails closed without it", () => {
    const limited = buildDungeonList(gates, [
      { series: "hobs", daily_limit: 5, clears_today: 3, clears_left: 2 },
    ]);
    expect(
      limited.find((series) => series.id === "hobs")?.stages.map((stage) => stage.leftToday),
    ).toEqual([2, 2, 2, 2]);
    expect(buildDungeonList(gates).find((series) => series.id === "hobs")?.leftToday).toBe(0);
    expect(limited.find((series) => series.id === "toads")?.leftToday).toBeUndefined();
  });

  it("lists canonical capture and drop rewards, including rare replacements and key items", () => {
    const map = buildDungeonList(gates);
    expect(map.find((series) => series.id === "hobs")?.stages[0]?.rewards).toContain("Grand Hob");
    const toads = map.find((series) => series.id === "toads")?.stages[0]?.rewards;
    for (const name of ["Lantern Toad", "Regent Toad", "Matriarch Toad"])
      expect(toads).toContain(name);
    expect(
      map
        .find((series) => series.id === "colossus")
        ?.stages.find((stage) => stage.id === "dungeon-crown-shard")?.rewards,
    ).toBe("Drops: Crown Shard.");
    expect(map.find((series) => series.id === "zenith-core")?.stages[0]?.rewards).toBe(
      "Drops: Zenith Core.",
    );
    expect(
      map
        .find((series) => series.id === "items")
        ?.stages.find((stage) => stage.id === "dungeon-item-dew-tonic")?.rewards,
    ).toBe("Drops: Dew Tonic.");
  });
});
