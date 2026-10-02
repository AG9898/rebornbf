import { describe, expect, it } from "vitest";
import { fusionResultView, parseFuseResponse } from "./fusion-result.ts";
import { type OwnedUnitRow, toOwnedUnitView } from "./owned-units.ts";

const brand: OwnedUnitRow = {
  id: "00000000-0000-4000-8000-000000000001",
  unit_id: "brand",
  form_id: "brand-3",
  level: 1,
  exp: 0,
  bb_level: 1,
  sbb_level: 1,
};

const fuseData = (overrides: Record<string, unknown> = {}) => ({
  target_id: brand.id,
  outcome: "success",
  exp_gained: 2259,
  exp: 2259,
  level: 9,
  bb_level: 1,
  sbb_level: 1,
  zel_spent: 100,
  fodder_consumed: 1,
  ...overrides,
});

describe("parseFuseResponse", () => {
  it("reads fuse's jsonb result", () => {
    expect(parseFuseResponse(fuseData({ outcome: "great", sbb_level: null }))).toEqual({
      outcome: "great",
      expGained: 2259,
      exp: 2259,
      level: 9,
      bbLevel: 1,
      sbbLevel: null,
    });
  });
  it("rejects malformed results", () => {
    expect(parseFuseResponse(null)).toBeNull();
    expect(parseFuseResponse(fuseData({ outcome: "mega" }))).toBeNull();
    expect(parseFuseResponse(fuseData({ level: "9" }))).toBeNull();
    expect(parseFuseResponse(fuseData({ sbb_level: 1.5 }))).toBeNull();
  });
});

describe("fusionResultView", () => {
  it("shows before ▶ after stats from the server's level, with risen values flagged", () => {
    const response = parseFuseResponse(fuseData());
    if (!response) throw new Error("parse failed");
    const view = fusionResultView(brand, response);
    const before = toOwnedUnitView(brand).currentStats;
    const after = toOwnedUnitView({ ...brand, level: 9, exp: 2259 }).currentStats;
    expect(view.left[0]).toEqual({ label: "Lv.", before: "1/40", after: "9/40", rose: true });
    expect(view.left[1]).toMatchObject({
      label: "HP",
      before: before?.hp.toLocaleString("en-US"),
      after: after?.hp.toLocaleString("en-US"),
      rose: true,
    });
    expect(view.left[2]).toEqual({ label: "BB Lv.", before: "1", after: "1", rose: false });
    expect(view.right.map((r) => r.label)).toEqual(["Atk", "Def", "Rec"]);
    expect(view.levelUp).toBe(true);
    expect(view.successText).toBeNull();
    expect(view.quote).toBe("Steel remembers the forge. Stand behind me and watch it burn.");
    expect(view.expToNext).toBeGreaterThan(0);
    expect(view.expProgress).toBeGreaterThanOrEqual(0);
    expect(view.expProgress).toBeLessThan(1);
  });
  it("names Great and Super Success only when rolled", () => {
    const great = parseFuseResponse(fuseData({ outcome: "great" }));
    const sup = parseFuseResponse(fuseData({ outcome: "super" }));
    if (!great || !sup) throw new Error("parse failed");
    expect(fusionResultView(brand, great).successText).toBe("Great Success! 1.5x XP");
    expect(fusionResultView(brand, sup).successText).toBe("Super Success! 2x XP");
  });
  it("hides LEVEL UP!! when the level did not rise, and shows MAX progress at the cap", () => {
    const capped = { ...brand, level: 40, exp: 97408 };
    const response = parseFuseResponse(
      fuseData({ exp: 97408, level: 40, exp_gained: 2259, bb_level: 3 }),
    );
    if (!response) throw new Error("parse failed");
    const view = fusionResultView(capped, response);
    expect(view.levelUp).toBe(false);
    expect(view.left[0]).toMatchObject({ before: "40/40", after: "40/40", rose: false });
    expect(view.left[2]).toEqual({ label: "BB Lv.", before: "1", after: "3", rose: true });
    expect(view.expToNext).toBeNull();
    expect(view.expProgress).toBe(1);
  });
  it("applies the preview's stat hob totals to the after stats", () => {
    const response = parseFuseResponse(fuseData({ level: 1, exp: 0 }));
    if (!response) throw new Error("parse failed");
    const view = fusionResultView(brand, response, { hp: 50, atk: 0, def: 0, rec: 0 });
    expect(view.left[1]?.rose).toBe(true);
    expect(view.right[0]?.rose).toBe(false);
    expect(view.levelUp).toBe(false);
  });
});
