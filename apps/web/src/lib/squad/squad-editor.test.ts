import { describe, expect, it } from "vitest";
import {
  draftFromRow,
  draftProblem,
  draftsEqual,
  EMPTY_DRAFT,
  parseSquadSlot,
  type SquadDraft,
  setLeader,
  toggleAlly,
  toggleGuest,
  toggleSquadUnit,
} from "./squad-editor.ts";

const OWNED = new Set(["a", "b", "c", "d", "e", "f"]);

function draft(unitIds: string[], leaderIndex = 0, allyUnitId: string | null = null): SquadDraft {
  return { unitIds, leaderIndex, allyUnitId };
}

describe("draftFromRow", () => {
  it("returns an empty draft when no squad is saved", () => {
    expect(draftFromRow(null, OWNED)).toEqual(EMPTY_DRAFT);
  });

  it("reloads a saved squad in order with its leader and ally", () => {
    const row = { slot: 0, unit_ids: ["c", "a", "b"], leader_index: 1, ally_unit_id: "a" };
    expect(draftFromRow(row, OWNED)).toEqual(draft(["c", "a", "b"], 1, "a"));
  });

  it("drops units the player no longer owns and keeps the leader unit", () => {
    const row = { slot: 0, unit_ids: ["x", "a", "b"], leader_index: 2, ally_unit_id: "y" };
    expect(draftFromRow(row, OWNED)).toEqual(draft(["a", "b"], 1, null));
  });

  it("falls back to the first unit when the leader is gone", () => {
    const row = { slot: 0, unit_ids: ["a", "x"], leader_index: 1, ally_unit_id: null };
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

describe("setLeader and toggleAlly", () => {
  it("sets a leader only inside the squad", () => {
    expect(setLeader(draft(["a", "b"]), 1).leaderIndex).toBe(1);
    expect(setLeader(draft(["a", "b"]), 2).leaderIndex).toBe(0);
  });

  it("sets, swaps, and clears the ally, which may duplicate a squad unit", () => {
    const withAlly = toggleAlly(draft(["a"]), "a");
    expect(withAlly.allyUnitId).toBe("a");
    expect(toggleAlly(withAlly, "b").allyUnitId).toBe("b");
    expect(toggleAlly(withAlly, "a").allyUnitId).toBeNull();
  });
});

describe("draftProblem", () => {
  it("swaps between guests and duplicates, restores guests, and detects guest changes", () => {
    const guest = toggleGuest(draft(["a"], 0, "a"), "aurelle");
    expect(guest).toMatchObject({ allyUnitId: null, guestId: "aurelle" });
    expect(toggleAlly(guest, "a")).toMatchObject({ allyUnitId: "a", guestId: null });
    expect(toggleGuest(guest, "aurelle").guestId).toBeNull();
    expect(
      draftFromRow(
        { slot: 0, unit_ids: ["a"], leader_index: 0, ally_unit_id: null, guest_id: "aurelle" },
        OWNED,
      ),
    ).toEqual(guest);
    expect(draftsEqual(guest, draft(["a"]))).toBe(false);
    expect(draftProblem({ ...guest, allyUnitId: "a" })).toBe("Choose one ally.");
  });
  it("accepts 1-5 distinct units with a leader among them", () => {
    expect(draftProblem(draft(["a"]))).toBeNull();
    expect(draftProblem(draft(["a", "b", "c", "d", "e"], 4, "a"))).toBeNull();
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

  it("compares order, leader, and ally", () => {
    expect(draftsEqual(draft(["a", "b"], 1, "c"), draft(["a", "b"], 1, "c"))).toBe(true);
    expect(draftsEqual(draft(["a", "b"]), draft(["b", "a"]))).toBe(false);
    expect(draftsEqual(draft(["a"], 0, null), draft(["a"], 0, "a"))).toBe(false);
  });
});
