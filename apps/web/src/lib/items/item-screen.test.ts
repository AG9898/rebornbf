import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ORIGINAL_ASSETS } from "../original/original-assets.ts";
import {
  ALL_ITEMS,
  ITEM_MANAGE_ASSETS,
  ITEM_MANAGE_BUTTONS,
  ITEM_MENU_BUTTONS,
  ITEM_SCREEN_ASSETS,
  itemEntries,
  itemManageHref,
} from "./item-screen.ts";

const itemsDir = join(import.meta.dirname, "../../../../../packages/data/content/items");

describe("Items screens (M8-10)", () => {
  it("draws only imported original pieces", () => {
    for (const asset of [...ITEM_SCREEN_ASSETS, ...ITEM_MANAGE_ASSETS])
      expect(asset in ORIGINAL_ASSETS, asset).toBe(true);
  });

  it("Manage Items edits a squad's loadout; Village and Synthesis stay disabled (M8-10_1)", () => {
    expect(ITEM_MANAGE_BUTTONS.map((b) => [b.label, b.action])).toEqual([
      ["Fill Up", "fill"],
      ["Reset", "reset"],
      ["Village of the Venturer", null],
      ["Synthesis", null],
    ]);
    expect(itemManageHref(0)).toBe("/items/manage");
    expect(itemManageHref(3)).toBe("/items/manage?slot=3");
  });

  it("opens View and Manage Items and leaves the screens BFR lacks disabled", () => {
    expect(ITEM_MENU_BUTTONS.map((b) => [b.label, b.href])).toEqual([
      ["View Items", "/items/list"],
      ["Manage Items", "/items/manage"],
      ["Sell Items", null],
      ["Synthesis", null],
    ]);
  });

  it("knows every item content file", () => {
    const ids = readdirSync(itemsDir).map((file) => file.replace(/\.json$/, ""));
    expect(ALL_ITEMS.map((item) => item.id).sort()).toEqual(ids.sort());
  });

  it("lists owned items battle items first, skipping empty and unknown rows", () => {
    const entries = itemEntries([
      { item_id: "crown-shard", count: 2 },
      { item_id: "bright-tonic", count: 7 },
      { item_id: "dew-tonic", count: 0 },
      { item_id: "no-such-item", count: 4 },
    ]);
    expect(entries.map((e) => [e.id, e.kind, e.count])).toEqual([
      ["bright-tonic", "battle", 7],
      ["crown-shard", "material", 2],
    ]);
    expect(entries[0]?.icon).toBe("item-bright-tonic");
  });
});
