import { describe, expect, it } from "vitest";
import { createBattle } from "../state/create-battle.ts";
import { makeEnemy } from "../test/factories.ts";
import { units } from "./content.ts";

describe("unit content invariants", () => {
  it("uses globally unique form IDs", () => {
    const ids = units.flatMap((unit) => unit.forms.map((form) => form.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe.each(units)("$id", (unit) => {
    // UnitSchema already checks attack distributions, sorted frames, positive burst costs,
    // effect shapes, local form IDs and evolution recipe placement. Exercise the real engine
    // boundary too, including all burst and nested skill effect registrations.
    it.each(unit.forms)("creates a battle with $id", (form) => {
      const state = createBattle(
        {
          squad: [{ unit, formId: form.id, stats: form.stats.max }],
          leaderIndex: 0,
          waves: [[makeEnemy("dummy")]],
        },
        7,
      );
      expect(state.party[0]?.form.id).toBe(form.id);
    });
  });
});
