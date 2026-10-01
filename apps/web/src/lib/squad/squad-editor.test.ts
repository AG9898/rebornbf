import { describe, expect, it } from "vitest";
import {
  draftFromRow,
  draftProblem,
  draftsEqual,
  EMPTY_DRAFT,
  fillSquadSlots,
  parseSquadSlot,
  pedestalOrder,
  type SquadDraft,
  setLeader,
  stepSquadSlot,
  toggleSquadUnit,
} from "./squad-editor.ts";

const OWNED = new Set(["a", "b", "c", "d", "e", "f"]);

function draft(unitIds: string[], leaderIndex = 0): SquadDraft {
  return { unitIds, leaderIndex };
}

describe("draftFromRow", () => {
  it("returns an empty draft when no squad is saved", () => {
    expect(draftFromRow(null, OWNED)).toEqual(EMPTY_DRAFT);
  });

  it("reloads a saved squad in order with its leader", () => {
    const row = { slot: 0, unit_ids: ["c", "a", "b"], leader_index: 1 };
    expect(draftFromRow(row, OWNED)).toEqual(draft(["c", "a", "b"], 1));
  });

  it("drops units the player no longer owns and keeps the leader unit", () => {
    const row = { slot: 0, unit_ids: ["x", "a", "b"], leader_index: 2 };
    expect(draftFromRow(row, OWNED)).toEqual(draft(["a", "b"], 1));
  });

  it("falls back to the first unit when the leader is gone", () => {
    const row = { slot: 0, unit_ids: ["a", "x"], leader_index: 1 };
    expect(draftFromRow(row, OWNED).leaderIndex).toBe(0);
  });
});

describe("toggleSquadUnit", () => {
  it("adds to the end and removes on a second tap", () => {
    const added = toggleSquadUnit(draft(["a"]), "b");
    expect(added.unitIds).toEqual(["a", "b"]);
    expect(toggleSquadUnit(added, "b").unitIds).toEqual(["a"]);
  });

  it("does not add a sixth unit", () => {
    const full = draft(["a", "b", "c", "d", "e"]);
    expect(toggleSquadUnit(full, "f")).toBe(full);
  });

  it("keeps the leader unit when an earlier unit is removed", () => {
    const next = toggleSquadUnit(draft(["a", "b", "c"], 2), "a");
    expect(next).toEqual(draft(["b", "c"], 1));
  });

  it("moves the leader to the first unit when the leader is removed", () => {
    expect(toggleSquadUnit(draft(["a", "b", "c"], 1), "b")).toEqual(draft(["a", "c"], 0));
  });
});

describe("setLeader", () => {
  it("sets a leader only inside the squad", () => {
    expect(setLeader(draft(["a", "b"]), 1).leaderIndex).toBe(1);
    expect(setLeader(draft(["a", "b"]), 2).leaderIndex).toBe(0);
  });
});

describe("fillSquadSlots (M4-06F)", () => {
  it("confirms three picks into empty pedestals in pick order, keeping the leader", () => {
    const before = draft(["a", "b"], 1);
    const filled = fillSquadSlots(before, ["e", "c", "d"], OWNED);
    expect(filled).toEqual({ ...before, unitIds: ["a", "b", "e", "c", "d"] });
    expect(pedestalOrder(filled).map((position) => filled.unitIds[position])).toEqual([
      "b",
      "a",
      "e",
      "c",
      "d",
    ]);
    expect(draftProblem(filled)).toBeNull();
    expect(
      draftFromRow(
        {
          slot: 0,
          unit_ids: [...filled.unitIds],
          leader_index: filled.leaderIndex,
        },
        OWNED,
      ),
    ).toEqual(draft(["a", "b", "e", "c", "d"], 1));
    expect(before.unitIds).toEqual(["a", "b"]);
  });

  it("rejects party members, repeated picks, unknown ids, and overflow", () => {
    expect(fillSquadSlots(draft(["a", "b", "c"]), ["a", "x", "d", "d", "e", "f"], OWNED)).toEqual(
      draft(["a", "b", "c", "d", "e"]),
    );
  });

  it("fills an empty squad from the centre", () => {
    const before = EMPTY_DRAFT;
    expect(fillSquadSlots(before, ["c", "a", "b"], OWNED)).toEqual({
      ...before,
      unitIds: ["c", "a", "b"],
    });
  });

  it("leaves a full squad or a cancelled selection unchanged", () => {
    const before = draft(["a", "b", "c", "d", "e"], 3);
    expect(fillSquadSlots(before, ["f"], OWNED)).toEqual(before);
    expect(fillSquadSlots(before, [], OWNED)).toEqual(before);
  });
});

describe("draftProblem", () => {
  it("accepts 1-5 distinct units with a leader among them", () => {
    expect(draftProblem(draft(["a"]))).toBeNull();
    expect(draftProblem(draft(["a", "b", "c", "d", "e"], 4))).toBeNull();
  });

  it("rejects empty, oversized, repeated, and bad-leader squads", () => {
    expect(draftProblem(EMPTY_DRAFT)).not.toBeNull();
    expect(draftProblem(draft(["a", "b", "c", "d", "e", "f"]))).not.toBeNull();
    expect(draftProblem(draft(["a", "a"]))).not.toBeNull();
    expect(draftProblem(draft(["a"], 1))).not.toBeNull();
  });
});

describe("parseSquadSlot and draftsEqual", () => {
  it("reads slots 0-9 and defaults anything else to 0", () => {
    expect(parseSquadSlot("3")).toBe(3);
    expect(parseSquadSlot(["9", "1"])).toBe(9);
    for (const bad of [undefined, "", "10", "-1", "x", "1.5"]) expect(parseSquadSlot(bad)).toBe(0);
  });

  it("compares order and leader", () => {
    expect(draftsEqual(draft(["a", "b"], 1), draft(["a", "b"], 1))).toBe(true);
    expect(draftsEqual(draft(["a", "b"]), draft(["b", "a"]))).toBe(false);
    expect(draftsEqual(draft(["a", "b"], 0), draft(["a", "b"], 1))).toBe(false);
  });
});

describe("pedestalOrder", () => {
  it("puts the leader's position in the centre and the rest in squad order", () => {
    expect(pedestalOrder(draft(["a", "b", "c"], 2))).toEqual([2, 0, 1, 3, 4]);
    expect(pedestalOrder(draft(["a", "b", "c", "d", "e"], 0))).toEqual([0, 1, 2, 3, 4]);
  });

  it("centres position 0 for an empty squad or an out-of-range leader", () => {
    expect(pedestalOrder(EMPTY_DRAFT)).toEqual([0, 1, 2, 3, 4]);
    expect(pedestalOrder(draft(["a"], 3))).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("stepSquadSlot", () => {
  it("wraps round the ten squad slots", () => {
    expect(stepSquadSlot(0, -1)).toBe(9);
    expect(stepSquadSlot(9, 1)).toBe(0);
    expect(stepSquadSlot(4, 1)).toBe(5);
  });
});
