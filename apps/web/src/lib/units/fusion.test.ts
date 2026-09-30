import { describe, expect, it } from "vitest";
import { canBeFodder, fusionDraftProblem, fusionPreview } from "./fusion.ts";
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
