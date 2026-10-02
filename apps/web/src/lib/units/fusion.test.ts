import { describe, expect, it } from "vitest";
import {
  canBeFodder,
  FUSION_MINIMUM_NOTE,
  fodderCopyGrants,
  fusionBaseMaxed,
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

  it("counts each stack as one of the 1–5 fodder slots, with 1–99 copies (RESOLVED-90)", () => {
    const stackIds = [1, 2, 3, 4, 5, 6].map((n) => `00000000-0000-4000-8000-00000000bbb${n}`);
    expect(fusionDraftProblem(target.id, [], { [stack.id]: 1 })).toBeNull();
    expect(fusionDraftProblem(target.id, [flask.id], { [stack.id]: 99 })).toBeNull();
    expect(
      fusionDraftProblem(
        target.id,
        [],
        Object.fromEntries(stackIds.slice(0, 5).map((k) => [k, 99])),
      ),
    ).toBeNull();
    expect(fusionDraftProblem(target.id, [flask.id], { [stack.id]: 100 })).toBe(
      "A stack slot holds 1–99 copies.",
    );
    expect(
      fusionDraftProblem(
        target.id,
        [flask.id],
        Object.fromEntries(stackIds.slice(0, 5).map((k) => [k, 1])),
      ),
    ).toBe("Choose 1–5 fodder slots.");
    expect(fusionDraftProblem(target.id, [], {})).toBe("Choose 1–5 fodder slots.");
    expect(fusionDraftProblem(target.id, [], { "not-a-stack": 1 })).toBe(
      "Choose valid stacked units.",
    );
    expect(fusionDraftProblem(target.id, [], { [stack.id]: 1.5 })).toBe(
      "Choose valid stacked units.",
    );
    expect(fusionDraftProblem(target.id, [], { [stack.id]: 0 })).toBe(
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

const fodderOf = (unit_id: string, form_id: string, n = 9): OwnedUnitRow => ({
  ...flask,
  id: `00000000-0000-4000-8000-00000000c00${n}`,
  unit_id,
  form_id,
});
const mightHob = fodderOf("might-hob", "might-hob-3");
const vitalHob = fodderOf("vital-hob", "vital-hob-3");
const grandHob = fodderOf("grand-hob", "grand-hob-3");
const satchel = fodderOf("satchel-toad", "satchel-toad-3");
const lantern = fodderOf("lantern-toad", "lantern-toad-3");
const duplicate = fodderOf("brand", "brand-3");
/** Brand 3★ at its max level 40 (97,408 EXP on the base-10 curve), BB 10 (no SBB). */
const maxLevel: OwnedUnitRow = { ...target, level: 40, exp: 97_408, bb_level: 10 };

describe("hob and sphere-slot preview (M4-01E)", () => {
  it("adds hob gains up to the form's imp caps", () => {
    expect(
      fusionPreview({ ...target, imps: { hp: 0, atk: 190, def: 0, rec: 0 } }, [grandHob]),
    ).toMatchObject({ imps: { hp: 150, atk: 200, def: 60, rec: 60 }, problem: null });
  });
  it("flags a hob copy that would grant nothing, as fuse rejects the whole fusion", () => {
    const capped = { ...target, imps: { hp: 0, atk: 180, def: 0, rec: 0 } };
    expect(fusionPreview(capped, [mightHob])?.problem).toBeNull();
    expect(fusionPreview(capped, [mightHob, mightHob])?.problem).toMatch(/grant nothing/);
  });
  it("opens the second sphere slot with one Satchel Toad and flags any other", () => {
    expect(fusionPreview(target, [satchel])).toMatchObject({
      secondSphereSlot: true,
      problem: null,
    });
    expect(fusionPreview(target, [flask])?.secondSphereSlot).toBe(false);
    expect(fusionPreview(target, [satchel, satchel])?.problem).toMatch(/one Satchel Toad/);
    expect(fusionPreview({ ...target, second_sphere_slot: true }, [satchel])?.problem).toMatch(
      /already open/,
    );
  });
});

describe("no wasted picks at ×1 (RESOLVED-90 item 3)", () => {
  it("allows the copy that reaches max level and none after (1 EXP below max)", () => {
    const edge = { ...target, level: 39, exp: 97_407, bb_level: 10 };
    expect(fodderCopyGrants(edge, [], flask)).toBe(true);
    expect(fodderCopyGrants(edge, [flask], flask)).toBe(false);
    expect(fodderCopyGrants(maxLevel, [], flask)).toBe(false);
  });
  it("counts matching-element and duplicate bonuses, but not the success roll", () => {
    // From level 1 a Fire Flask gives 2,259; 43 reach 97,137 and the 44th passes 97,408.
    const flasks = Array(43).fill(flask);
    expect(fodderCopyGrants({ ...target, bb_level: 10 }, flasks, flask)).toBe(true);
    expect(fodderCopyGrants({ ...target, bb_level: 10 }, [...flasks, flask], flask)).toBe(false);
  });
  it("keeps duplicates and burst toads while BB or SBB is below 10", () => {
    const bb9 = { ...maxLevel, bb_level: 9 };
    expect(fodderCopyGrants(bb9, [], duplicate)).toBe(true);
    expect(fodderCopyGrants(bb9, [duplicate], duplicate)).toBe(false);
    expect(fodderCopyGrants(bb9, [], lantern)).toBe(true);
    expect(fodderCopyGrants(bb9, [lantern], lantern)).toBe(false);
    const omni = { ...target, form_id: "brand-omni", level: 150, exp: 2_782_165 };
    expect(fodderCopyGrants({ ...omni, bb_level: 10, sbb_level: 9 }, [], lantern)).toBe(true);
    expect(fodderCopyGrants({ ...omni, bb_level: 10, sbb_level: 10 }, [], lantern)).toBe(false);
  });
  it("keeps a stat hob while one of its stats is below the form's cap", () => {
    const atk180 = { ...maxLevel, imps: { hp: 500, atk: 180, def: 0, rec: 0 } };
    expect(fodderCopyGrants(atk180, [], mightHob)).toBe(true);
    expect(fodderCopyGrants(atk180, [mightHob], mightHob)).toBe(false);
    expect(fodderCopyGrants(atk180, [mightHob], vitalHob)).toBe(false);
    // A Grand Hob still has HP/DEF/REC room once ATK is capped...
    const atk200 = { ...maxLevel, imps: { hp: 0, atk: 200, def: 0, rec: 0 } };
    expect(fodderCopyGrants(atk200, [], grandHob)).toBe(true);
    // ...but fuse applies hobs in unit-id order, so a Grand Hob first leaves the Might Hob nothing.
    expect(fodderCopyGrants(atk180, [mightHob], grandHob)).toBe(false);
  });
  it("keeps the Satchel Toad only while the slot is closed and none is picked", () => {
    expect(fodderCopyGrants(maxLevel, [], satchel)).toBe(true);
    expect(fodderCopyGrants(maxLevel, [satchel], satchel)).toBe(false);
    expect(fodderCopyGrants({ ...maxLevel, second_sphere_slot: true }, [], satchel)).toBe(false);
  });
  it("never allows a copy fuse would reject, even below max level", () => {
    const capped = { ...target, bb_level: 10, imps: { hp: 0, atk: 200, def: 0, rec: 0 } };
    expect(fodderCopyGrants(capped, [], flask)).toBe(true);
    expect(fodderCopyGrants(capped, [], mightHob)).toBe(false);
    expect(fodderCopyGrants(capped, [], lantern)).toBe(false);
  });
});

describe("fully maxed bases (RESOLVED-90 item 4)", () => {
  const full: OwnedUnitRow = {
    ...target,
    form_id: "brand-omni",
    level: 150,
    exp: 2_782_165,
    bb_level: 10,
    sbb_level: 10,
    imps: { hp: 2200, atk: 880, def: 460, rec: 460 },
    second_sphere_slot: true,
  };
  it("reports a base nothing could improve", () => {
    expect(fusionBaseMaxed(full)).toBe(true);
    expect(
      fusionBaseMaxed({
        ...maxLevel,
        imps: { hp: 500, atk: 200, def: 120, rec: 120 },
        second_sphere_slot: true,
      }),
    ).toBe(true);
  });
  it.each([
    ["level", { level: 149 }],
    ["BB", { bb_level: 9 }],
    ["SBB", { sbb_level: 9 }],
    ["sphere slot", { second_sphere_slot: false }],
    ["imps", { imps: { hp: 2200, atk: 880, def: 460, rec: 459 } }],
  ])("keeps a base missing its %s selectable", (_, change) => {
    expect(fusionBaseMaxed({ ...full, ...change })).toBe(false);
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
