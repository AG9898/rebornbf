import { describe, expect, it } from "vitest";
import type { OwnedUnitRow } from "../units/owned-units.ts";
import { beginQuestHref, reinforcements } from "./reinforcement.ts";

const owned: OwnedUnitRow[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    unit_id: "brand",
    form_id: "brand-omni",
    level: 120,
    exp: 0,
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    unit_id: "maren",
    form_id: "maren-3",
    level: 1,
    exp: 0,
  },
];

describe("Reinforcement (M3-04I)", () => {
  it("lists every owned row plus guests scaled to the collection, capped at their form level", () => {
    const choices = reinforcements(owned);
    expect(choices.filter((unit) => unit.yours).map((unit) => unit.id)).toEqual(
      owned.map((row) => row.id),
    );
    const guests = choices.filter((unit) => !unit.yours);
    expect(guests).toHaveLength(2);
    for (const guest of guests) {
      expect(guest.rarity).toBe(6);
      expect(guest.level).toBe(guest.maxLevel);
      expect(guest.leaderSkill).toBeTruthy();
      expect(guest.thumb).toBeTruthy();
    }
  });
  it("sorts all choices by level and omits guests with no matching collection form", () => {
    const levels = reinforcements(owned, "level").map((unit) => unit.level);
    expect(levels).toEqual([...levels].sort((a, b) => b - a));
    expect(reinforcements([])).toEqual([]);
  });
  it("carries the same ally when switching squads and omits it for No Ally", () => {
    expect(beginQuestHref("story", "guest-aurelle", 7)).toBe(
      "/start/story/begin?slot=7&ally=guest-aurelle",
    );
    expect(beginQuestHref("story", owned[0]?.id ?? null, 1)).toContain("slot=1&ally=00000000");
    expect(beginQuestHref("story", null)).toBe("/start/story/begin?slot=0");
  });
});
