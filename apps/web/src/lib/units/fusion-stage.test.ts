import { describe, expect, it } from "vitest";
import {
  addFodderPicks,
  baseIneligible,
  chooseBase,
  EMPTY_DRAFT,
  type FusionDraft,
  fodderIneligible,
  fodderPedestals,
  fodderPickerEntries,
  freePedestals,
  removeFodderPedestal,
} from "./fusion-stage.ts";
import { unitContent } from "./owned-units.ts";
import { collectionEntries } from "./unit-stacks.ts";

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const stackId = "10000000-0000-4000-8000-000000000001";
const moteStack = "10000000-0000-4000-8000-000000000002";

const entries = collectionEntries(
  [
    { id: id(1), unit_id: "brand", form_id: "brand-3", level: 1, exp: 0 },
    { id: id(2), unit_id: "maren", form_id: "maren-3", level: 1, exp: 0 },
    { id: id(3), unit_id: "rook", form_id: "rook-3", level: 1, exp: 0 },
    { id: id(4), unit_id: "nobody", form_id: "nobody-3", level: 1, exp: 0 },
  ],
  [
    { id: stackId, unit_id: "cinder-flask", form_id: "cinder-flask-3", count: 4 },
    { id: moteStack, unit_id: "cinder-mote", form_id: "cinder-mote-1", count: 2 },
  ],
);

const based: FusionDraft = { ...EMPTY_DRAFT, targetId: id(1) };

describe("fusion stage draft (M4-06D)", () => {
  it("fills pedestals with rows first, then one per stacked copy", () => {
    const draft: FusionDraft = { targetId: id(1), fodderIds: [id(2)], stacks: { [stackId]: 2 } };
    expect(fodderPedestals(draft)).toEqual([
      { kind: "row", id: id(2) },
      { kind: "stack", id: stackId },
      { kind: "stack", id: stackId },
    ]);
    expect(freePedestals(draft)).toBe(2);
  });

  it("removes one copy per tapped pedestal", () => {
    const draft: FusionDraft = { targetId: id(1), fodderIds: [id(2)], stacks: { [stackId]: 2 } };
    expect(removeFodderPedestal(draft, 0).fodderIds).toEqual([]);
    expect(removeFodderPedestal(draft, 1).stacks).toEqual({ [stackId]: 1 });
    expect(removeFodderPedestal(removeFodderPedestal(draft, 2), 1).stacks).toEqual({});
    expect(removeFodderPedestal(draft, 4)).toBe(draft);
  });

  it("clears the fodder when the base changes", () => {
    const draft: FusionDraft = { targetId: id(1), fodderIds: [id(2)], stacks: {} };
    expect(chooseBase(draft, id(1))).toBe(draft);
    expect(chooseBase(draft, id(3))).toEqual({ targetId: id(3), fodderIds: [], stacks: {} });
  });

  it("adds picks only up to the free pedestals", () => {
    const draft: FusionDraft = { targetId: id(1), fodderIds: [id(2)], stacks: { [stackId]: 2 } };
    const next = addFodderPicks(draft, {
      unitIds: [id(1), id(2), id(3)],
      stacks: { [stackId]: 3 },
    });
    expect(next.fodderIds).toEqual([id(2), id(3)]);
    expect(next.stacks).toEqual({ [stackId]: 3 });
    expect(freePedestals(next)).toBe(0);
  });

  it("offers neither the base, placed rows, nor placed stack copies", () => {
    const draft: FusionDraft = { targetId: id(1), fodderIds: [id(2)], stacks: { [stackId]: 4 } };
    const shown = fodderPickerEntries(entries, draft).map((e) => [e.id, e.stackCount]);
    expect(shown).not.toContainEqual([id(1), null]);
    expect(shown).not.toContainEqual([id(2), null]);
    expect(shown.find(([entry]) => entry === moteStack)).toBeUndefined();
    expect(shown.find(([entry]) => entry === stackId)).toBeUndefined();
    const partial = fodderPickerEntries(entries, { ...draft, stacks: { [stackId]: 1 } });
    expect(partial.find((e) => e.id === stackId)?.stackCount).toBe(3);
  });

  it("hides all 28 dedicated evolution materials as rows and stacks, without changing base eligibility", () => {
    const materialIds = [
      ...["cinder", "rill", "moss", "volt", "glint", "dusk"].flatMap((element) =>
        ["mote", "effigy", "cairn", "colossus"].map((family) => `${element}-${family}`),
      ),
      "prism-cairn",
      "glint-urn",
      "dusk-urn",
      "wyrm-coffer",
    ];
    for (const unitId of materialIds) {
      const form = unitContent(unitId)?.forms[0];
      if (!form) throw new Error(`Missing material fixture: ${unitId}`);
      const materials = collectionEntries(
        [{ id: id(5), unit_id: unitId, form_id: form.id, level: 1, exp: 0 }],
        [{ id: stackId, unit_id: unitId, form_id: form.id, count: 3 }],
      );
      expect(fodderPickerEntries(materials, based), unitId).toEqual([]);
      expect(baseIneligible(materials), unitId).not.toContain(id(5));
    }
  });

  it("keeps heroes, summon fillers, EXP vessels, stat hobs and toads in the fodder picker", () => {
    const visibleIds = [
      "brand",
      "maren",
      "rook",
      "garrick",
      "solen",
      "morrick",
      "aurelle",
      "vespera",
      "brass-crucible",
      "silver-crucible",
      ...["cinder", "rill", "moss", "volt", "glint", "dusk"].flatMap((element) =>
        ["sprite", "flask", "alembic", "athanor", "grail"].map((family) => `${element}-${family}`),
      ),
      "vital-hob",
      "might-hob",
      "ward-hob",
      "mend-hob",
      "grand-hob",
      "lantern-toad",
      "regent-toad",
      "matriarch-toad",
      "satchel-toad",
    ];
    for (const unitId of visibleIds) {
      const unit = unitContent(unitId);
      const form = unit?.forms[0];
      if (!unit || !form) throw new Error(`Missing fusion fixture: ${unitId}`);
      const candidates = collectionEntries(
        [{ id: id(5), unit_id: unitId, form_id: form.id, level: 1, exp: 0 }],
        unit.stackable ? [{ id: stackId, unit_id: unitId, form_id: form.id, count: 3 }] : [],
      );
      expect(fodderPickerEntries(candidates, based), unitId).toEqual(candidates);
    }
  });

  it("dims squad members, unknown units, and forms that give no EXP", () => {
    const dimmed = fodderIneligible(entries, [id(3)]);
    expect(dimmed).toEqual(expect.arrayContaining([id(3), id(4), moteStack]));
    expect(dimmed).not.toContain(id(2));
    expect(dimmed).not.toContain(stackId);
    expect(baseIneligible(entries)).toEqual(expect.arrayContaining([id(4), stackId, moteStack]));
    expect(baseIneligible(entries)).not.toContain(id(1));
    expect(freePedestals(based)).toBe(5);
  });
});
