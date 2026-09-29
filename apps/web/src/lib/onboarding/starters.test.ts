import { describe, expect, it } from "vitest";
import { isStarterUnitId, STARTER_UNIT_IDS, starterOptions } from "./starters.ts";

describe("starter pick options", () => {
  it("offers the six B0 starters at their 3★ card art", () => {
    const options = starterOptions();
    expect(options.map((o) => o.unitId)).toEqual([...STARTER_UNIT_IDS]);
    expect(options).toHaveLength(6);
    for (const option of options) {
      expect(option.cardArt).toBe(`/assets/ui/cards/${option.unitId}-3star.webp`);
      expect(option.name.length).toBeGreaterThan(0);
      expect(option.formName.length).toBeGreaterThan(0);
    }
  });

  it("recognises only starter ids", () => {
    expect(isStarterUnitId("maren")).toBe(true);
    expect(isStarterUnitId("aurelle")).toBe(false);
    expect(isStarterUnitId(undefined)).toBe(false);
  });
});
