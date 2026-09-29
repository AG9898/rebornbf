import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXP_CURVES, levelForExp, TO_NEXT_LEVEL, totalExpForLevel } from "./level-exp.ts";

// GAME_DESIGN §6 → Level EXP and fusion (RESOLVED-57): cumulative-EXP anchors.
const ANCHORS = {
  10: { 40: 97_408, 60: 274_191, 80: 568_832, 100: 1_000_006, 120: 1_584_380, 150: 2_782_165 },
  21: { 40: 194_812, 60: 548_372, 80: 1_137_658, 100: 2_000_006, 120: 3_174_957, 150: 5_557_940 },
} as const;

describe("level EXP curves (RESOLVED-57)", () => {
  it.each(EXP_CURVES)("base %i runs levels 1-149 starting at its Next Lv value", (curve) => {
    const steps = TO_NEXT_LEVEL[curve];
    expect(steps).toHaveLength(149);
    expect(steps[0]).toBe(curve);
    expect(steps.every((n) => Number.isInteger(n) && n > 0)).toBe(true);
  });

  it.each(EXP_CURVES)("base %i hits the documented cumulative anchors", (curve) => {
    for (const [level, total] of Object.entries(ANCHORS[curve])) {
      expect(totalExpForLevel(curve, Number(level))).toBe(total);
    }
  });

  it("uses the documented BFR extension values", () => {
    expect(TO_NEXT_LEVEL[10][119]).toBe(33_522);
    expect(TO_NEXT_LEVEL[10][148]).toBe(46_601);
    expect(TO_NEXT_LEVEL[21][119]).toBe(67_435);
    expect(TO_NEXT_LEVEL[21][148]).toBe(91_456);
  });

  it("derives levels from EXP, capped at the form's max level", () => {
    // Cinder Flask into Brand from level 1: level 9 with 402 EXP toward level 10.
    expect(levelForExp(10, 2_259, 40)).toBe(9);
    expect(2_259 - totalExpForLevel(10, 9)).toBe(402);
    // Five matching Flasks: level 17 with 791 toward 18.
    expect(levelForExp(10, 11_295, 40)).toBe(17);
    expect(11_295 - totalExpForLevel(10, 17)).toBe(791);
    expect(levelForExp(10, 0, 40)).toBe(1);
    expect(levelForExp(10, 97_408, 40)).toBe(40);
    expect(levelForExp(10, 10_000_000, 40)).toBe(40);
    expect(levelForExp(21, 10_000_000, 150)).toBe(150);
  });

  it("matches the curve table in the fuse migration", () => {
    const dir = join(import.meta.dirname, "..", "..", "..", "supabase", "migrations");
    const name = readdirSync(dir).find((n) => n.endsWith("_fuse.sql"));
    expect(name).toBeDefined();
    const sql = readFileSync(join(dir, name ?? ""), "utf8");
    for (const curve of EXP_CURVES) {
      const match = new RegExp(`\\(${curve}, array\\[([\\d,\\s]+)\\]`).exec(sql);
      expect(match, `curve ${curve} in migration`).not.toBeNull();
      const values = (match?.[1] ?? "").split(",").map((v) => Number(v.trim()));
      expect(values).toEqual(TO_NEXT_LEVEL[curve]);
    }
  });
});
