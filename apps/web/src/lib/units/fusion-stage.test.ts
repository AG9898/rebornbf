import { describe, expect, it } from "vitest";
import {
  addFodderCopy,
  addGrantingFodderCopy,
  baseIneligible,
  chooseBase,
  clearFodder,
  draftCopies,
  draftFodderIds,
  draftFodderRows,
  draftStacks,
  EMPTY_DRAFT,
  type FusionDraft,
  fodderIneligible,
  fodderPickerEntries,
  freeSlots,
  removeFodderCopy,
} from "./fusion-stage.ts";
import { type OwnedUnitRow, unitContent } from "./owned-units.ts";
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

const row = (n: number) => ({ id: id(n), stackCount: null });
const flaskTile = (held: number) => ({ id: stackId, stackCount: held });
const mixed: FusionDraft = {
  targetId: id(1),
  slots: [
    { kind: "row", id: id(2), copies: 1 },
    { kind: "stack", id: stackId, copies: 2 },
  ],
};

describe("fusion stage draft (M4-06D, RESOLVED-90 slots)", () => {
  it("keeps slots in pick order and derives the fuse arguments", () => {
    expect(draftFodderIds(mixed)).toEqual([id(2)]);
    expect(draftStacks(mixed)).toEqual({ [stackId]: 2 });
    expect(draftCopies(mixed)).toBe(3);
    expect(freeSlots(mixed)).toBe(3);
  });

  it("adds one copy at a time: a row opens a slot, a stack grows its own slot", () => {
    let draft = addFodderCopy(based, flaskTile(4));
    draft = addFodderCopy(draft, row(2));
    draft = addFodderCopy(draft, flaskTile(4));
    expect(draft.slots).toEqual([
      { kind: "stack", id: stackId, copies: 2 },
      { kind: "row", id: id(2), copies: 1 },
    ]);
    expect(addFodderCopy(draft, row(2))).toBe(draft);
    expect(addFodderCopy(draft, row(1))).toBe(draft);
  });

  it("caps a stack slot at its held copies and at 99", () => {
    let draft = based;
    for (let i = 0; i < 6; i += 1) draft = addFodderCopy(draft, flaskTile(4));
    expect(draft.slots).toEqual([{ kind: "stack", id: stackId, copies: 4 }]);
    for (let i = 0; i < 120; i += 1) draft = addFodderCopy(draft, flaskTile(500));
    expect(draft.slots).toEqual([{ kind: "stack", id: stackId, copies: 99 }]);
    expect(addFodderCopy(based, flaskTile(0))).toBe(based);
  });

  it("allows at most five slots, however many copies they hold", () => {
    let draft = addFodderCopy(based, flaskTile(50));
    for (const n of [2, 3, 5, 6]) draft = addFodderCopy(draft, row(n));
    expect(draft.slots).toHaveLength(5);
    expect(freeSlots(draft)).toBe(0);
    expect(addFodderCopy(draft, row(7))).toBe(draft);
    expect(addFodderCopy(draft, { id: moteStack, stackCount: 2 })).toBe(draft);
    expect(addFodderCopy(draft, flaskTile(50)).slots[0]?.copies).toBe(2);
  });

  it("removes one copy per tap; a slot at 0 empties and Remove All clears them", () => {
    expect(removeFodderCopy(mixed, 0).slots).toEqual([{ kind: "stack", id: stackId, copies: 2 }]);
    expect(removeFodderCopy(mixed, 1).slots[1]).toEqual({ kind: "stack", id: stackId, copies: 1 });
    expect(removeFodderCopy(removeFodderCopy(mixed, 1), 1).slots).toHaveLength(1);
    expect(removeFodderCopy(mixed, 4)).toBe(mixed);
    expect(clearFodder(mixed)).toEqual({ targetId: id(1), slots: [] });
    expect(clearFodder(based)).toBe(based);
  });

  it("clears the fodder when the base changes", () => {
    expect(chooseBase(mixed, id(1))).toBe(mixed);
    expect(chooseBase(mixed, id(3))).toEqual({ targetId: id(3), slots: [] });
  });

  it("hides the base but keeps placed rows and shows a stack's unplaced copies, down to ×0", () => {
    const draft: FusionDraft = {
      targetId: id(1),
      slots: [
        { kind: "row", id: id(2), copies: 1 },
        { kind: "stack", id: stackId, copies: 4 },
      ],
    };
    const shown = fodderPickerEntries(entries, draft).map((e) => [e.id, e.stackCount]);
    expect(shown).not.toContainEqual([id(1), null]);
    expect(shown).toContainEqual([id(2), null]);
    expect(shown).toContainEqual([stackId, 0]);
    expect(shown.find(([entry]) => entry === moteStack)).toBeUndefined();
    const partial = fodderPickerEntries(entries, {
      ...draft,
      slots: [{ kind: "stack", id: stackId, copies: 1 }],
    });
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
    expect(freeSlots(based)).toBe(5);
  });

  it("dims a fully maxed base (RESOLVED-90 item 4) but not one missing any improvement", () => {
    const maxed: OwnedUnitRow = {
      id: id(1),
      unit_id: "brand",
      form_id: "brand-3",
      level: 40,
      exp: 0,
      bb_level: 10,
      imps: { hp: 500, atk: 200, def: 120, rec: 120 },
      second_sphere_slot: true,
    };
    expect(baseIneligible(entries, [maxed])).toContain(id(1));
    expect(baseIneligible(entries, [{ ...maxed, level: 39 }])).not.toContain(id(1));
  });
});

describe("tap/hold fodder picking (M4-01F, RESOLVED-90 items 2–3)", () => {
  const base: OwnedUnitRow = {
    id: id(1),
    unit_id: "brand",
    form_id: "brand-3",
    level: 1,
    exp: 0,
    bb_level: 10,
  };
  const maren: OwnedUnitRow = { id: id(2), unit_id: "maren", form_id: "maren-3", level: 1, exp: 0 };
  const flasks = { id: stackId, unit_id: "cinder-flask", form_id: "cinder-flask-3", count: 60 };
  const start: FusionDraft = { targetId: id(1), slots: [] };

  /** Holds a tile down: adds copies until a repeat changes nothing. */
  function hold(draft: FusionDraft, entry: { id: string; stackCount: number | null }) {
    let current = draft;
    for (let i = 0; i < 200; i += 1) {
      const next = addGrantingFodderCopy(current, entry, [base, maren], [flasks]);
      if (next === current) break;
      current = next;
    }
    return current;
  }

  it("stops a hold at the copy that reaches max level (44 Cinder Flasks from Lv.1)", () => {
    const held = hold(start, { id: stackId, stackCount: 60 });
    expect(held.slots).toEqual([{ kind: "stack", id: stackId, copies: 44 }]);
    expect(draftFodderRows(held, [base, maren], [flasks])).toHaveLength(44);
    // With the base at max EXP nothing more is pickable, not even a row.
    expect(
      addGrantingFodderCopy(held, { id: id(2), stackCount: null }, [base, maren], [flasks]),
    ).toBe(held);
  });

  it("stops at the held copies and needs a base", () => {
    expect(hold(start, { id: stackId, stackCount: 3 }).slots[0]?.copies).toBe(3);
    expect(
      addGrantingFodderCopy(EMPTY_DRAFT, { id: stackId, stackCount: 3 }, [base], [flasks]),
    ).toBe(EMPTY_DRAFT);
  });

  it("adds a row once and counts rows before stacked copies", () => {
    const draft = hold(start, { id: id(2), stackCount: null });
    expect(draft.slots).toEqual([{ kind: "row", id: id(2), copies: 1 }]);
    const mixedRows = draftFodderRows(
      { ...draft, slots: [{ kind: "stack", id: stackId, copies: 2 }, ...draft.slots] },
      [base, maren],
      [flasks],
    );
    expect(mixedRows.map((r) => r.unit_id)).toEqual(["maren", "cinder-flask", "cinder-flask"]);
  });
});
