import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fixedFusionExp, fusionZelCost, ordinaryFusionExp } from "./fusion.ts";
import { FormSchema, type Unit, UnitSchema } from "./schemas/unit.ts";

const unitsDir = join(import.meta.dirname, "..", "content", "units");

function loadUnit(id: string): Unit {
  return UnitSchema.parse(JSON.parse(readFileSync(join(unitsDir, `${id}.json`), "utf8")));
}

// GAME_DESIGN §6 → Growth fodder (RESOLVED-55): prefix → element, tier → rarity, base EXP, matching.
const PREFIXES = [
  ["cinder", "fire"],
  ["rill", "water"],
  ["moss", "earth"],
  ["volt", "thunder"],
  ["glint", "light"],
  ["dusk", "dark"],
] as const;
const TIERS = [
  ["flask", "Flask", 3, 1_506, 2_259],
  ["alembic", "Alembic", 4, 11_012, 16_518],
  ["athanor", "Athanor", 5, 51_518, 77_277],
  ["grail", "Grail", 5, 151_524, 227_286],
] as const;

const vessels = PREFIXES.flatMap(([prefix, element]) =>
  TIERS.map(([tier, tierName, rarity, exp, matching]) => ({
    id: `${prefix}-${tier}`,
    name: `${prefix[0]?.toUpperCase()}${prefix.slice(1)} ${tierName}`,
    element,
    rarity,
    exp,
    matching,
  })),
);

describe("EXP vessels (RESOLVED-55)", () => {
  it("are the 24 unit files", () => {
    const files = readdirSync(unitsDir).filter((n) =>
      /-(flask|alembic|athanor|grail)\.json$/.test(n),
    );
    expect(files.sort()).toEqual(vessels.map((v) => `${v.id}.json`).sort());
  });

  it.each(vessels)("$id is a level-1 $rarity★ $element vessel giving $exp EXP", (v) => {
    const unit = loadUnit(v.id);
    expect(unit.name).toBe(v.name);
    expect(unit.element).toBe(v.element);
    // The public mirror strips `source` (RESOLVED-61); where present it marks BFR-original.
    expect([undefined, { original: true }]).toContainEqual(unit.source);
    expect(unit.forms).toHaveLength(1);
    const [form] = unit.forms;
    expect(form).toMatchObject({
      id: `${v.id}-${v.rarity}`,
      name: v.name,
      rarity: v.rarity,
      maxLevel: 1,
      fusionExp: v.exp,
    });
    expect(form?.stats.max).toEqual(form?.stats.base);
    // Matching element ×1.5 (sourced); any other element gives the base EXP.
    expect(fixedFusionExp(v.exp, unit.element, v.element)).toBe(v.matching);
    const other = v.element === "fire" ? "water" : "fire";
    expect(fixedFusionExp(v.exp, unit.element, other)).toBe(v.exp);
  });
});

describe("Crucibles (RESOLVED-57)", () => {
  it("give fixed BFR EXP below a Flask", () => {
    expect(loadUnit("brass-crucible").forms[0]?.fusionExp).toBe(400);
    expect(loadUnit("silver-crucible").forms[0]?.fusionExp).toBe(1_000);
  });

  it("ordinary units carry no fixed EXP", () => {
    expect(loadUnit("brand").forms.every((f) => f.fusionExp === undefined)).toBe(true);
    expect(loadUnit("cinder-sprite").forms[0]?.fusionExp).toBeUndefined();
  });
});

describe("Satchel Toad (RESOLVED-55, M4-04D)", () => {
  it("is a stackable 3★ Water level-1 slot-unlock fodder with ordinary EXP", () => {
    const toad = loadUnit("satchel-toad");
    expect(toad.element).toBe("water");
    expect(toad.stackable).toBe(true);
    expect(toad.forms).toHaveLength(1);
    const form = toad.forms[0];
    expect(form?.id).toBe("satchel-toad-3");
    expect(form?.rarity).toBe(3);
    expect(form?.maxLevel).toBe(1);
    expect(form?.fusionEffect).toBe("sphereSlot");
    expect(form?.fusionExp).toBeUndefined();
    // Ordinary 3★ fodder EXP: 100 into a Fire target, 150 into a Water one.
    expect(ordinaryFusionExp(3, 1, 1, "water", "fire")).toBe(100);
    expect(ordinaryFusionExp(3, 1, 1, "water", "water")).toBe(150);
  });

  it("only the toads carry a fusion effect", () => {
    const withEffect = readdirSync(unitsDir)
      .filter((name) => name.endsWith(".json"))
      .flatMap((name) => loadUnit(name.slice(0, -".json".length)).forms)
      .filter((form) => form.fusionEffect !== undefined)
      .map((form) => form.id)
      .sort();
    expect(withEffect).toEqual([
      "lantern-toad-3",
      "matriarch-toad-4",
      "regent-toad-4",
      "satchel-toad-3",
    ]);
  });
});

describe("burst toads (RESOLVED-55, M4-04E)", () => {
  it.each([
    ["lantern-toad", "fire", 3, 1],
    ["regent-toad", "fire", 4, 5],
    ["matriarch-toad", "light", 4, 20],
  ] as const)(
    "%s is a stackable %s %i★ level-1 form granting %i burst levels",
    (id, element, rarity, levels) => {
      const toad = loadUnit(id);
      expect(toad.element).toBe(element);
      expect(toad.stackable).toBe(true);
      expect(toad.forms).toHaveLength(1);
      const form = toad.forms[0];
      expect(form?.id).toBe(`${id}-${rarity}`);
      expect(form?.rarity).toBe(rarity);
      expect(form?.maxLevel).toBe(1);
      expect(form?.fusionExp).toBeUndefined();
      expect(form?.fusionEffect).toEqual({ burstLevels: levels });
    },
  );

  it("rejects a malformed burst-level effect", () => {
    const form = loadUnit("lantern-toad").forms[0];
    for (const fusionEffect of [
      { burstLevels: 0 },
      { burstLevels: 1.5 },
      { burstLevels: 1, sp: 1 },
    ]) {
      expect(FormSchema.safeParse({ ...form, fusionEffect }).success).toBe(false);
    }
  });
});

describe("fixedFusionExp", () => {
  it("rounds down once after the element and duplicate multipliers", () => {
    expect(fixedFusionExp(1_506, "fire", "fire")).toBe(2_259);
    expect(fixedFusionExp(1_507, "fire", "fire")).toBe(2_260);
    expect(fixedFusionExp(1_507, "fire", "fire", true)).toBe(4_521);
    expect(fixedFusionExp(1_000, "light", "dark", true)).toBe(2_000);
  });
});

describe("ordinary fodder EXP and Zel (RESOLVED-57)", () => {
  it("scales from base at level 1 to double at max level", () => {
    // Maren 3★ at level 40 into Brand (Water into Fire): 100 × 2 = 200.
    expect(ordinaryFusionExp(3, 40, 40, "water", "fire")).toBe(200);
    expect(ordinaryFusionExp(3, 1, 40, "water", "fire")).toBe(100);
    expect(ordinaryFusionExp(3, 20, 40, "water", "fire")).toBe(148);
    expect(ordinaryFusionExp("omni", 150, 150, "dark", "fire")).toBe(3_000);
    expect(ordinaryFusionExp(2, 1, 1, "fire", "water")).toBe(50);
  });

  it("applies the matching-element and duplicate multipliers before rounding once", () => {
    // Brand 3★ at level 1 into Brand: ⌊100 × 1.5 × 2⌋ = 300.
    expect(ordinaryFusionExp(3, 1, 40, "fire", "fire", true)).toBe(300);
    // ⌊100 × (39 + 19) / 39 × 1.5⌋ = ⌊223.07⌋ = 223 (not ⌊148⌋ × 1.5 = 222).
    expect(ordinaryFusionExp(3, 20, 40, "fire", "fire")).toBe(223);
    expect(ordinaryFusionExp(4, 1, 1, "fire", "fire")).toBe(300);
  });

  it("rejects 1★ forms", () => {
    expect(() => ordinaryFusionExp(1, 1, 1, "fire", "fire")).toThrow(RangeError);
  });

  it("costs 100 Zel × target level per fodder unit", () => {
    expect(fusionZelCost(1, 5)).toBe(500);
    expect(fusionZelCost(30, 2)).toBe(6_000);
  });

  it("gives the documented matching Silver Crucible value", () => {
    expect(fixedFusionExp(1_000, "light", "light")).toBe(1_500);
  });
});
