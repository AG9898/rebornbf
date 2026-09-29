import { describe, expect, it } from "vitest";
import {
  formArtFile,
  isOwnedUnitId,
  type OwnedUnitRow,
  rarityLabel,
  sortOwnedUnits,
  toOwnedUnitView,
} from "./owned-units.ts";

const ROW_ID = "3f1c2b1e-9a4d-4c55-8e7a-1b2c3d4e5f60";

function row(overrides: Partial<OwnedUnitRow> = {}): OwnedUnitRow {
  return { id: ROW_ID, unit_id: "brand", form_id: "brand-6", level: 1, exp: 0, ...overrides };
}

describe("toOwnedUnitView", () => {
  it("joins the row with the form's content, stats, and art", () => {
    const view = toOwnedUnitView(row({ level: 42, exp: 1234 }));
    expect(view).toMatchObject({
      id: ROW_ID,
      name: "Brand",
      formName: "Ember Knight",
      element: "fire",
      rarity: 6,
      rarityLabel: "6★",
      level: 42,
      maxLevel: 100,
      exp: 1234,
      illustration: "/assets/units/brand/illustration-6star.png",
      sprite: "/assets/units/brand/battle-idle-6star.png",
      thumb: "/assets/ui/cards/thumb/brand-6star.webp",
    });
    expect(view.stats).toEqual({
      base: { hp: 3254, atk: 1227, def: 1106, rec: 973 },
      max: { hp: 5313, atk: 1660, def: 1456, rec: 1376 },
    });
    // Between level 1 and max the growth curve is open (M1-08D).
    expect(view.currentStats).toBeNull();
  });

  it("gives exact current stats at level 1 and at max level", () => {
    expect(toOwnedUnitView(row({ level: 1 })).currentStats).toEqual({
      hp: 3254,
      atk: 1227,
      def: 1106,
      rec: 973,
    });
    expect(toOwnedUnitView(row({ level: 100 })).currentStats).toEqual({
      hp: 5313,
      atk: 1660,
      def: 1456,
      rec: 1376,
    });
  });

  it("uses the omni art file and label for Omni forms", () => {
    const view = toOwnedUnitView(row({ unit_id: "maren", form_id: "maren-omni" }));
    expect(view.rarityLabel).toBe("Omni");
    expect(view.illustration).toBe("/assets/units/maren/illustration-omni.png");
    expect(view.thumb).toBe("/assets/ui/cards/thumb/maren-omni.webp");
  });

  it("has no art for units or forms without exports", () => {
    expect(
      toOwnedUnitView(row({ unit_id: "no-such-unit", form_id: "no-such-unit-2" })).sprite,
    ).toBe(null);
    expect(formArtFile("brand", 2)).toBeNull();
    expect(formArtFile("brand", 3)).toBe("3star");
  });

  it("gives summon filler units their single form's art", () => {
    const view = toOwnedUnitView(row({ unit_id: "moss-sprite", form_id: "moss-sprite-2" }));
    expect(view.sprite).toBe("/assets/units/moss-sprite/battle-idle-2star.png");
    expect(view.thumb).toBe("/assets/ui/cards/thumb/moss-sprite-2star.webp");
    expect(formArtFile("silver-crucible", 3)).toBe("3star");
  });

  it("degrades to the raw ids when the content is missing", () => {
    const view = toOwnedUnitView(row({ unit_id: "retired-unit", form_id: "retired-unit-5" }));
    expect(view).toMatchObject({
      name: "retired-unit",
      formName: null,
      rarity: null,
      rarityLabel: "?",
      stats: null,
      currentStats: null,
      illustration: null,
      thumb: null,
    });
    expect(toOwnedUnitView(row({ form_id: "brand-9" })).stats).toBeNull();
  });
});

describe("sortOwnedUnits", () => {
  it("orders by rarity, then level, then name", () => {
    const units = [
      toOwnedUnitView(row({ id: "a", unit_id: "rook", form_id: "rook-5", level: 10 })),
      toOwnedUnitView(row({ id: "b", unit_id: "brand", form_id: "brand-omni", level: 1 })),
      toOwnedUnitView(row({ id: "c", unit_id: "maren", form_id: "maren-5", level: 30 })),
      toOwnedUnitView(row({ id: "d", unit_id: "garrick", form_id: "garrick-5", level: 30 })),
      toOwnedUnitView(row({ id: "e", unit_id: "unknown", form_id: "unknown-1", level: 99 })),
    ];
    expect(sortOwnedUnits(units).map((u) => u.id)).toEqual(["b", "d", "c", "a", "e"]);
  });
});

describe("isOwnedUnitId", () => {
  it("accepts uuids and rejects other segments", () => {
    expect(isOwnedUnitId(ROW_ID)).toBe(true);
    for (const value of ["brand", "", "1", `${ROW_ID}x`, "../account"]) {
      expect(isOwnedUnitId(value)).toBe(false);
    }
  });
});

describe("rarityLabel", () => {
  it("labels star rarities and Omni", () => {
    expect(rarityLabel(3)).toBe("3★");
    expect(rarityLabel("omni")).toBe("Omni");
  });
});
