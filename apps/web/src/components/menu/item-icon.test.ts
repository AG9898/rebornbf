import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { itemIconPiece } from "../../game/assets/ui.ts";
import { BATTLE_ITEMS } from "../../lib/quests/item-loadout.ts";
import { itemIcon } from "./item-icon.ts";

const itemsDir = join(import.meta.dirname, "../../../../../packages/data/content/items");
const uiDir = join(import.meta.dirname, "../../../public/assets/ui");

describe("item icons (M6-10B)", () => {
  it("exports an icon for every launch item", () => {
    const ids = readdirSync(itemsDir).map((file) => file.replace(/\.json$/, ""));
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(itemIcon(id)).toBe(`item-${id}`);
      expect(existsSync(join(uiDir, `item-${id}.webp`))).toBe(true);
    }
  });

  it("preloads every battle item's icon for the item bar", () => {
    for (const item of BATTLE_ITEMS) expect(itemIconPiece(item.id)).toBe(`item-${item.id}`);
  });

  it("has no icon for an unknown item", () => {
    expect(itemIcon("no-such-item")).toBeNull();
    expect(itemIconPiece("no-such-item")).toBeUndefined();
  });
});
