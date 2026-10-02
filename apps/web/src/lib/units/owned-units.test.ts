import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Form } from "@bfr/data";
import { TYPE_GAIN_RANGES } from "@bfr/engine";
import { describe, expect, it } from "vitest";
import {
  formArtFile,
  formLeaderSkill,
  isOwnedUnitId,
  levelLabel,
  nextUnitSort,
  type OwnedUnitRow,
  parseUnitSort,
  rarityLabel,
  sortOwnedUnits,
  statsAtLevel,
  toOwnedUnitView,
  toUnitDetailView,
  unitContent,
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
      quote: "Steel remembers the forge. Stand behind me and watch it burn.",
    });
    expect(view.stats).toEqual({
      base: { hp: 3254, atk: 1227, def: 1106, rec: 973 },
      max: { hp: 5313, atk: 1660, def: 1456, rec: 1376 },
    });
    // Lord curve (GAME_DESIGN §6): base + floor((max − base) × 41 / 99).
    expect(view.currentStats).toEqual({ hp: 4106, atk: 1406, def: 1250, rec: 1139 });
  });

  it("applies the persisted type roll to current and range stats (M1-08D)", () => {
    // Brand 3★ worked example: Anima (+7 HP, −2 REC) at level 20.
    const anima = { type: "anima", gains: { hp: 7, atk: 0, def: 0, rec: -2 } } as const;
    const view = toOwnedUnitView(
      row({ form_id: "brand-3", level: 20, unit_type: { ...anima, gains: { ...anima.gains } } }),
    );
    expect(view.currentStats).toEqual({ hp: 2120, atk: 769, def: 657, rec: 511 });
    expect(view.stats?.max).toEqual({ hp: 2790, atk: 917, def: 806, rec: 624 });
    expect(toOwnedUnitView(row({ form_id: "brand-3", level: 20 })).currentStats).toEqual({
      hp: 1987,
      atk: 769,
      def: 657,
      rec: 549,
    });
  });

  it("gives no current stats for a level outside the form or an invalid roll", () => {
    expect(toOwnedUnitView(row({ level: 101 })).currentStats).toBeNull();
    expect(toOwnedUnitView(row({ level: 0 })).currentStats).toBeNull();
    const bad = { type: "lord" as const, gains: { hp: 5, atk: 0, def: 0, rec: 0 } };
    expect(toOwnedUnitView(row({ level: 5, unit_type: bad })).currentStats).toBeNull();
    expect(statsAtLevel(unitContent("brand")?.forms[0] as Form, 1.5)).toBeNull();
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

  it("gives growth fodder vessels their single form's art", () => {
    const view = toOwnedUnitView(row({ unit_id: "volt-athanor", form_id: "volt-athanor-5" }));
    expect(view.name).toBe("Volt Athanor");
    expect(view.quote).toBeNull();
    expect(view.sprite).toBe("/assets/units/volt-athanor/battle-idle-5star.png");
    expect(view.thumb).toBe("/assets/ui/cards/thumb/volt-athanor-5star.webp");
  });

  it.each(["vital-hob", "might-hob", "ward-hob", "mend-hob", "grand-hob"])(
    "uses the locked splash, sprite and thumbnail for %s in collection and detail views",
    (unitId) => {
      const owned = row({ unit_id: unitId, form_id: `${unitId}-3` });
      const paths = {
        illustration: `/assets/units/${unitId}/illustration-3star.png`,
        sprite: `/assets/units/${unitId}/battle-idle-3star.png`,
        thumb: `/assets/ui/cards/thumb/${unitId}-3star.webp`,
      };
      expect(formArtFile(unitId, 3)).toBe("3star");
      expect(toOwnedUnitView(owned)).toMatchObject(paths);
      expect(toUnitDetailView(owned)).toMatchObject(paths);
      for (const path of Object.values(paths)) {
        expect(existsSync(new URL(`../../../public${path}`, import.meta.url)), path).toBe(true);
      }
    },
  );

  it.each(["cinder-mote", "rill-mote", "moss-mote", "volt-mote", "glint-mote", "dusk-mote"])(
    "gives the 1★ Mote %s its locked splash, sprite and thumbnail (M6-08E)",
    (unitId) => {
      const owned = row({ unit_id: unitId, form_id: `${unitId}-1` });
      const paths = {
        illustration: `/assets/units/${unitId}/illustration-1star.png`,
        sprite: `/assets/units/${unitId}/battle-idle-1star.png`,
        thumb: `/assets/ui/cards/thumb/${unitId}-1star.webp`,
      };
      expect(formArtFile(unitId, 1)).toBe("1star");
      expect(toOwnedUnitView(owned)).toMatchObject(paths);
      for (const path of Object.values(paths)) {
        expect(existsSync(new URL(`../../../public${path}`, import.meta.url)), path).toBe(true);
      }
    },
  );

  it("degrades to the raw ids when the content is missing", () => {
    const view = toOwnedUnitView(row({ unit_id: "retired-unit", form_id: "retired-unit-5" }));
    expect(view).toMatchObject({
      name: "retired-unit",
      formName: null,
      quote: null,
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

describe("toUnitDetailView", () => {
  it("adds the type, EXP to the next level, and the form's skill names", () => {
    const view = toUnitDetailView(
      row({
        unit_id: "brand",
        form_id: "brand-7",
        level: 2,
        exp: 34,
        unit_type: { type: "breaker", gains: { hp: 0, atk: 2, def: -1, rec: 0 } },
      }),
    );
    expect(view).toMatchObject({
      typeLabel: "Breaker",
      expToNext: 24,
      expProgress: 0.5,
      skills: {
        leader: "Legend's Forge",
        extra: "Unbanked Coals",
        burst: "Cinder Charge Apex",
      },
    });
  });

  it("treats a unit without a roll as a Lord and hides skills the form lacks", () => {
    const view = toUnitDetailView(row({ form_id: "brand-2", level: 1, exp: 0, unit_type: null }));
    expect(view.typeLabel).toBe("Lord");
    expect(view.expToNext).toBe(10);
    expect(view.expProgress).toBe(0);
    expect(view.skills).toEqual({
      leader: "Kindling Resolve",
      extra: null,
      burst: "Cinder Charge",
    });
  });

  it("has no next level at the cap or for an invalid level", () => {
    expect(toUnitDetailView(row({ level: 100 }))).toMatchObject({
      expToNext: null,
      expProgress: 1,
    });
    expect(toUnitDetailView(row({ level: 101 }))).toMatchObject({
      expToNext: null,
      expProgress: 0,
    });
  });

  it("has no skills for unknown content", () => {
    const view = toUnitDetailView(row({ unit_id: "nobody", form_id: "nobody-1" }));
    expect(view.skills).toEqual({ leader: null, extra: null, burst: null });
    expect(view.expToNext).toBeNull();
  });
});

describe("formLeaderSkill", () => {
  it("names the form's Leader Skill, or null", () => {
    expect(formLeaderSkill("brand", "brand-7")).toBe("Legend's Forge");
    expect(formLeaderSkill("brand", "brand-99")).toBeNull();
    expect(formLeaderSkill("nobody", "nobody-1")).toBeNull();
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

  it("sorts by level, element, or name first, falling back to rarity order", () => {
    const units = [
      toOwnedUnitView(row({ id: "a", unit_id: "rook", form_id: "rook-5", level: 10 })),
      toOwnedUnitView(row({ id: "b", unit_id: "brand", form_id: "brand-omni", level: 1 })),
      toOwnedUnitView(row({ id: "c", unit_id: "maren", form_id: "maren-5", level: 30 })),
      toOwnedUnitView(row({ id: "d", unit_id: "garrick", form_id: "garrick-5", level: 30 })),
    ];
    const ids = (key: Parameters<typeof sortOwnedUnits>[1]) =>
      sortOwnedUnits(units, key).map((u) => u.id);
    expect(ids("level")).toEqual(["d", "c", "a", "b"]);
    expect(ids("name")).toEqual(["b", "d", "c", "a"]);
    const elements = sortOwnedUnits(units, "element").map((u) => u.element);
    expect(elements).toEqual([...elements].sort((x, y) => order(x) - order(y)));
  });
});

const order = (e: string | null) =>
  ["fire", "water", "earth", "thunder", "light", "dark", null].indexOf(e);

describe("unit sort keys", () => {
  it("parses ?sort= and cycles through every key", () => {
    expect(parseUnitSort("level")).toBe("level");
    expect(parseUnitSort(undefined)).toBe("rarity");
    expect(parseUnitSort("bogus")).toBe("rarity");
    expect(parseUnitSort(["name"])).toBe("rarity");
    expect(nextUnitSort("rarity")).toBe("level");
    expect(nextUnitSort("name")).toBe("rarity");
  });
});

describe("levelLabel", () => {
  it("shows Lv.MAX at the form's cap", () => {
    expect(levelLabel({ level: 12, maxLevel: 60 })).toBe("Lv.12");
    expect(levelLabel({ level: 60, maxLevel: 60 })).toBe("Lv.MAX");
    expect(levelLabel({ level: 3, maxLevel: null })).toBe("Lv.3");
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

describe("type gain ranges", () => {
  it("match the unit_type_rolls migration the server rolls from (M3-01D)", () => {
    const dir = join(import.meta.dirname, "..", "..", "..", "..", "..", "supabase", "migrations");
    const name = readdirSync(dir).find((n) => n.endsWith("_unit_type_rolls.sql"));
    expect(name).toBeDefined();
    const sql = readFileSync(join(dir, name ?? ""), "utf8");
    const literal = /select '(\{[^']*\})'::jsonb/.exec(sql)?.[1];
    expect(literal).toBeDefined();
    expect(JSON.parse(literal ?? "{}")).toEqual(TYPE_GAIN_RANGES);
  });
});
