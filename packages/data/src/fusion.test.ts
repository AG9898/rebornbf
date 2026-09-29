import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fixedFusionExp } from "./fusion.ts";
import { type Unit, UnitSchema } from "./schemas/unit.ts";

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

describe("fixedFusionExp", () => {
  it("rounds down once after the element and duplicate multipliers", () => {
    expect(fixedFusionExp(1_506, "fire", "fire")).toBe(2_259);
    expect(fixedFusionExp(1_507, "fire", "fire")).toBe(2_260);
    expect(fixedFusionExp(1_507, "fire", "fire", true)).toBe(4_521);
    expect(fixedFusionExp(1_000, "light", "dark", true)).toBe(2_000);
  });
});
