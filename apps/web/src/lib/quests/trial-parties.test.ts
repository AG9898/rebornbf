import { describe, expect, it } from "vitest";
import { EMPTY_DRAFT, type SquadDraft } from "../squad/squad-editor.ts";
import {
  addToParty,
  afterAllyHref,
  beforeAllyHref,
  editPartySlots,
  isTrialPlan,
  otherPartyAllies,
  otherPartyUnits,
  parseAllyParty,
  parsePrepSquad,
  parseTrialPlan,
  partiesProblem,
  planSlots,
  stepPartySlot,
  trialStartChoice,
  withAlly,
} from "./trial-parties.ts";

const draft = (unitIds: string[], leaderIndex = 0): SquadDraft => ({ unitIds, leaderIndex });
const owned = new Set(["a", "b", "c", "d", "e", "f", "g"]);

describe("trial party validation (M6-01K)", () => {
  it("needs units in Party 1 and refuses a unit in two parties", () => {
    expect(partiesProblem([EMPTY_DRAFT, draft(["a"]), EMPTY_DRAFT])).toBe(
      "Add at least one unit to Party 1.",
    );
    expect(partiesProblem([draft(["a", "b"]), draft(["c", "b"]), EMPTY_DRAFT])).toBe(
      "No unit may fight in two parties.",
    );
    expect(partiesProblem([draft(["a"]), draft(["b"])])).toBe("A trial takes three parties.");
    expect(partiesProblem([draft(["a", "b"]), EMPTY_DRAFT, draft(["c"])])).toBeNull();
  });

  it("refuses picking a unit already in another party", () => {
    const parties = [draft(["a", "b"]), draft(["c"]), EMPTY_DRAFT];
    expect(otherPartyUnits(parties, 2)).toEqual(["a", "b", "c"]);
    const next = addToParty(parties, 2, ["a", "d", "c", "e"], owned);
    expect(next[2]?.unitIds).toEqual(["d", "e"]);
    expect(next[0]).toBe(parties[0]);
    // A full party takes no more; unowned picks are dropped.
    const full = addToParty(
      [draft(["a", "b", "c", "d", "e"]), EMPTY_DRAFT, EMPTY_DRAFT],
      0,
      ["f"],
      owned,
    );
    expect(full[0]?.unitIds).toHaveLength(5);
    expect(addToParty(parties, 1, ["zz"], owned)[1]?.unitIds).toEqual(["c"]);
  });

  it("binds parties to distinct saved slots and skips empty ones in the plan", () => {
    expect(editPartySlots(null)).toEqual([0, 1, 2]);
    expect(editPartySlots([4])).toEqual([4, 0, 1]);
    expect(editPartySlots([2, 0])).toEqual([2, 0, 1]);
    expect(stepPartySlot([0, 1, 2], 0, 1)).toBe(3);
    expect(stepPartySlot([0, 1, 2], 2, -1)).toBe(9);
    expect(stepPartySlot([0, 1, 9], 1, 1)).toBe(2);
    expect(planSlots([3, 5, 7], [draft(["a"]), EMPTY_DRAFT, draft(["b"])])).toEqual([3, 7]);
  });
});

describe("trial plan URLs and payload (M6-01K)", () => {
  it("parses slots, allies, party and squad from the query", () => {
    expect(parseTrialPlan({ s: "0,1,4", a1: "aurelle", a3: "bad id!" })).toEqual({
      slots: [0, 1, 4],
      allies: ["aurelle", null, null],
    });
    for (const s of [undefined, "", "0,0", "10", "0,1,2,3", ["0"]]) {
      expect(parseTrialPlan({ s })).toBeNull();
    }
    const plan = { slots: [0, 1], allies: [null, null] };
    expect(parseAllyParty({ party: "2" }, plan)).toBe(2);
    expect(parseAllyParty({ party: "3" }, plan)).toBeNull();
    expect(parsePrepSquad({ squad: "5" }, plan)).toBe(1);
    expect(parsePrepSquad({}, plan)).toBe(0);
  });

  it("steps through each party's ally, then the prep screen, and back", () => {
    const plan = { slots: [0, 1, 4], allies: [null, null, null] };
    const one = withAlly(plan, 1, "aurelle");
    expect(afterAllyHref("trial-01", one, 1)).toBe(
      "/start/trial-01?s=0%2C1%2C4&a1=aurelle&party=2",
    );
    expect(afterAllyHref("trial-01", one, 3)).toBe(
      "/start/trial-01/begin?s=0%2C1%2C4&a1=aurelle&squad=0",
    );
    expect(beforeAllyHref("trial-01", one, 2)).toBe(
      "/start/trial-01?s=0%2C1%2C4&a1=aurelle&party=1",
    );
    expect(beforeAllyHref("trial-01", one, 1)).toBe("/start/trial-01?s=0,1,4");
  });

  it("lets no ally serve two parties, counting each owned copy or guest once", () => {
    // Two owned copies of one unit are two rows (two ids): each may serve one party.
    const plan = withAlly(
      withAlly({ slots: [0, 1, 2], allies: [null, null, null] }, 1, "copy-1"),
      2,
      "copy-2",
    );
    expect(plan.allies).toEqual(["copy-1", "copy-2", null]);
    expect(otherPartyAllies(plan, 3)).toEqual(
      new Map([
        ["copy-1", 1],
        ["copy-2", 2],
      ]),
    );
    expect(otherPartyAllies(plan, 1)).toEqual(new Map([["copy-2", 2]]));
    // Re-choosing a taken ally moves it rather than duplicating it.
    expect(withAlly(plan, 3, "copy-1").allies).toEqual([null, "copy-2", "copy-1"]);
    // A hand-edited URL repeating an ally keeps only the first party's.
    expect(parseTrialPlan({ s: "0,1,2", a1: "aurelle", a2: "aurelle", a3: "aurelle" })).toEqual({
      slots: [0, 1, 2],
      allies: ["aurelle", null, null],
    });
    expect(isTrialPlan({ slots: [0, 1], allies: ["aurelle", "aurelle"] })).toBe(false);
    expect(isTrialPlan({ slots: [0, 1], allies: [null, null] })).toBe(true);
  });

  it("builds the start_battle choice with all three squads", () => {
    const plan = { slots: [2, 0, 5], allies: ["aurelle", null, "unit-row"] };
    expect(isTrialPlan(plan)).toBe(true);
    expect(trialStartChoice(plan)).toEqual({
      slot: 2,
      ally: "aurelle",
      reserves: [
        { slot: 0, ally: null },
        { slot: 5, ally: "unit-row" },
      ],
    });
    expect(trialStartChoice({ slots: [3], allies: [null] }).reserves).toEqual([]);
    for (const bad of [
      null,
      { slots: [], allies: [] },
      { slots: [0, 0], allies: [null, null] },
      { slots: [0, 1, 2, 3], allies: [null, null, null, null] },
      { slots: [10], allies: [null] },
      { slots: [0], allies: [] },
      { slots: [0], allies: [7] },
    ]) {
      expect(isTrialPlan(bad)).toBe(false);
    }
  });
});
