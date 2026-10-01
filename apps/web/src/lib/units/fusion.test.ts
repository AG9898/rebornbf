import { describe, expect, it } from "vitest";
import {
  canBeFodder,
  FUSION_MINIMUM_NOTE,
  fusionDraftProblem,
  fusionPreview,
  fusionResultMessage,
} from "./fusion.ts";
import type { OwnedUnitRow } from "./owned-units.ts";
import { stackCopies } from "./unit-stacks.ts";

const target: OwnedUnitRow = {
  id: "00000000-0000-4000-8000-000000000001",
  unit_id: "brand",
  form_id: "brand-3",
  level: 1,
  exp: 0,
};
const flask: OwnedUnitRow = {
  id: "00000000-0000-4000-8000-000000000002",
  unit_id: "cinder-flask",
  form_id: "cinder-flask-3",
  level: 1,
  exp: 0,
};

describe("fusion preview", () => {
  it("matches the worked Fire Flask example and payment", () => {
    expect(fusionPreview(target, [flask])).toMatchObject({
      gain: 2259,
      level: 9,
      exp: 2259,
      cost: 100,
      discarded: 0,
    });
  });
  it("uses the granted level floor and discards excess at the cap", () => {
    expect(fusionPreview({ ...target, level: 40 }, [flask])).toMatchObject({
      exp: 97408,
      level: 40,
      cost: 4000,
      discarded: 2259,
    });
  });
  it("uses the unit line's base-21 curve and matching element", () => {
    const aurelle = { ...target, unit_id: "aurelle", form_id: "aurelle-3" };
    const silver = { ...flask, unit_id: "silver-crucible", form_id: "silver-crucible-3" };
    expect(fusionPreview(aurelle, [silver])).toMatchObject({ gain: 1500, level: 6, cost: 100 });
  });
  it("awards the duplicate example and loses overflow when SBB is unavailable", () => {
    expect(fusionPreview(target, [{ ...target, id: flask.id }])).toMatchObject({
      gain: 300,
      bbLevel: 10,
      sbbLevel: null,
      burstDiscarded: 1,
    });
  });
  it("recognizes other forms of the same line and rounds only after doubling", () => {
    expect(fusionPreview(target, [{ ...target, id: flask.id, level: 2 }])?.gain).toBe(307);
    expect(fusionPreview(target, [{ ...target, id: flask.id, form_id: "brand-4" }])?.gain).toBe(
      600,
    );
  });
  it.each([
    [1, 1, 1, 10, 2, 0],
    [5, 3, 1, 10, 8, 0],
    [10, 1, 1, 10, 10, 1],
    [10, 10, 1, 10, 10, 10],
    [1, 1, 2, 10, 10, 2],
  ])("fills BB %i/SBB %i with %i duplicates", (bb, sbb, count, bbAfter, sbbAfter, discarded) => {
    const omni = { ...target, form_id: "brand-omni", bb_level: bb, sbb_level: sbb };
    expect(
      fusionPreview(
        omni,
        Array.from({ length: count }, () => ({ ...target, id: flask.id })),
      ),
    ).toMatchObject({
      bbLevel: bbAfter,
      sbbLevel: sbbAfter,
      burstDiscarded: discarded,
    });
  });
  it("discards EXP at maximum level but still raises burst levels", () => {
    expect(
      fusionPreview({ ...target, form_id: "brand-omni", level: 150 }, [
        { ...target, id: flask.id },
      ]),
    ).toMatchObject({
      gain: 300,
      discarded: 300,
      level: 150,
      bbLevel: 10,
      sbbLevel: 2,
    });
  });
  it("leaves burst levels alone for ordinary fodder", () => {
    expect(fusionPreview({ ...target, bb_level: 4 }, [flask])).toMatchObject({
      bbLevel: 4,
      burstDiscarded: 0,
    });
  });
  it("refuses unknown content instead of showing an incorrect preview", () => {
    expect(fusionPreview(target, [{ ...flask, form_id: "missing" }])).toBeNull();
  });
});

describe("burst toads (M4-04E)", () => {
  const toad = (unit: string, form: string): OwnedUnitRow => ({
    ...flask,
    unit_id: unit,
    form_id: form,
  });
  const lantern = toad("lantern-toad", "lantern-toad-3");
  const regent = toad("regent-toad", "regent-toad-4");
  const matriarch = toad("matriarch-toad", "matriarch-toad-4");
  const omni = (bb: number, sbb: number): OwnedUnitRow => ({
    ...target,
    form_id: "brand-omni",
    bb_level: bb,
    sbb_level: sbb,
  });

  it.each([
    [lantern, 1, 1, 2, 1, 0],
    [regent, 1, 1, 6, 1, 0],
    [matriarch, 5, 1, 10, 10, 6],
    [regent, 10, 9, 10, 10, 4],
  ])("adds levels BB-then-SBB (%#)", (fodder, bb, sbb, bbAfter, sbbAfter, lost) => {
    expect(fusionPreview(omni(bb, sbb), [fodder])).toMatchObject({
      bbLevel: bbAfter,
      sbbLevel: sbbAfter,
      burstDiscarded: lost,
      problem: null,
    });
  });
  it("shares the pool with duplicates and stacked copies", () => {
    const stacked = stackCopies(
      [{ id: "s", unit_id: "lantern-toad", form_id: "lantern-toad-3", count: 3 }],
      { s: 2 },
    );
    expect(fusionPreview(omni(1, 1), [{ ...target, id: flask.id }, ...stacked])).toMatchObject({
      bbLevel: 10,
      sbbLevel: 4,
      burstDiscarded: 0,
      cost: 300,
    });
  });
  it("loses overflow on a form without an SBB", () => {
    expect(fusionPreview({ ...target, bb_level: 8 }, [regent])).toMatchObject({
      bbLevel: 10,
      sbbLevel: null,
      burstDiscarded: 3,
      problem: null,
    });
  });
  it("flags a toad into a capped target, as fuse rejects it until SP ships", () => {
    expect(fusionPreview(omni(10, 10), [lantern])?.problem).toMatch(/capped/);
    expect(fusionPreview({ ...target, bb_level: 10 }, [lantern])?.problem).toMatch(/capped/);
    expect(fusionPreview(omni(10, 10), [flask])?.problem).toBeNull();
  });
});

describe("fusion draft validation", () => {
  it("allows 1–5 unique UUID fodder ids", () => {
    expect(fusionDraftProblem(target.id, [flask.id])).toBeNull();
  });
  it("rejects absent target, invalid ids, no fodder, repetition, self feeding and oversize", () => {
    for (const [id, fodder] of [
      ["", [flask.id]],
      [target.id, ["bad"]],
      [target.id, []],
      [target.id, [flask.id, flask.id]],
      [target.id, [target.id]],
      [target.id, Array(6).fill(flask.id)],
    ] as [string, string[]][]) {
      expect(fusionDraftProblem(id, fodder)).not.toBeNull();
    }
  });
});

describe("stacked fodder (M4-05C)", () => {
  const stack = { id: "00000000-0000-4000-8000-00000000aaaa", count: 4 };
  const flaskStack = { ...stack, unit_id: "cinder-flask", form_id: "cinder-flask-3" };

  it("counts stacked copies toward the 1–5 fodder limit", () => {
    expect(fusionDraftProblem(target.id, [], { [stack.id]: 1 })).toBeNull();
    expect(fusionDraftProblem(target.id, [flask.id], { [stack.id]: 4 })).toBeNull();
    expect(fusionDraftProblem(target.id, [flask.id], { [stack.id]: 5 })).toBe(
      "Choose 1–5 fodder units.",
    );
    expect(fusionDraftProblem(target.id, [], {})).toBe("Choose 1–5 fodder units.");
    expect(fusionDraftProblem(target.id, [], { "not-a-stack": 1 })).toBe(
      "Choose valid stacked units.",
    );
    expect(fusionDraftProblem(target.id, [], { [stack.id]: 1.5 })).toBe(
      "Choose valid stacked units.",
    );
  });

  it("previews stacked copies exactly like the same number of rows", () => {
    const copies = stackCopies([flaskStack], { [stack.id]: 2 });
    expect(copies).toHaveLength(2);
    expect(fusionPreview(target, copies)).toEqual(
      fusionPreview(target, [flask, { ...flask, id: "00000000-0000-4000-8000-000000000003" }]),
    );
    expect(fusionPreview(target, copies)?.cost).toBe(200);
  });
});

describe("canBeFodder", () => {
  it("rejects 1★ forms without fixed fusion EXP, as fodder_fusion_exp does", () => {
    expect(canBeFodder("cinder-flask", "cinder-flask-3")).toBe(true);
    expect(canBeFodder("moss-sprite", "moss-sprite-2")).toBe(true);
    expect(canBeFodder("cinder-mote", "cinder-mote-1")).toBe(false);
    expect(canBeFodder("nobody", "nobody-3")).toBe(false);
  });
});

describe("fusion success rolls (M4-06C)", () => {
  it("reports the server's outcome and EXP", () => {
    expect(fusionResultMessage({ outcome: "great", exp_gained: 3388 })).toBe(
      "Great Success! +3,388 EXP. Your unit has been updated.",
    );
    expect(fusionResultMessage({ outcome: "success", exp_gained: 2259 })).toMatch(/^Success! /);
    expect(fusionResultMessage(null)).toBe("Fusion complete. Your unit has been updated.");
    expect(fusionResultMessage({ outcome: "toString", exp_gained: 1 })).toBe(
      "Fusion complete. Your unit has been updated.",
    );
  });

  it("marks the preview EXP as the minimum", () => {
    expect(FUSION_MINIMUM_NOTE).toBe(
      "Minimum: a Great Success (×1.5, 10%) or Super Success (×2, 5%) may give more.",
    );
  });
});
