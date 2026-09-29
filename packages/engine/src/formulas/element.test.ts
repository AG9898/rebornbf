import { ELEMENTS, type Element } from "@bfr/data";
import { describe, expect, it } from "vitest";
import { elementMultiplier, elementOutcome, isStrongAgainst } from "./element.ts";

// GAME_DESIGN §1: fire → earth → thunder → water → fire; light ↔ dark. Rows: attacker;
// columns: defender in ELEMENTS order (fire, water, earth, thunder, light, dark).
const MATRIX: Record<Element, readonly number[]> = {
  fire: [1, 0.5, 1.5, 1, 1, 1],
  water: [1.5, 1, 1, 0.5, 1, 1],
  earth: [0.5, 1, 1, 1.5, 1, 1],
  thunder: [1, 1.5, 0.5, 1, 1, 1],
  light: [1, 1, 1, 1, 1, 1.5],
  dark: [1, 1, 1, 1, 1.5, 1],
};

const PAIRS = ELEMENTS.flatMap((attacker) =>
  ELEMENTS.map((defender, i) => ({ attacker, defender, expected: MATRIX[attacker][i] })),
);

describe("element matrix", () => {
  it("covers all 36 attacker/defender pairs", () => {
    expect(PAIRS).toHaveLength(36);
  });

  it.each(PAIRS)("$attacker vs $defender → ×$expected", ({ attacker, defender, expected }) => {
    expect(elementMultiplier({ attacker, defender })).toBe(expected);
    expect(isStrongAgainst(attacker, defender)).toBe(expected === 1.5);
  });
});

describe("element modifiers", () => {
  it("adds elemental-damage buffs to the 1.5 base, uncapped, only on own-element weakness", () => {
    expect(
      elementMultiplier({ attacker: "fire", defender: "earth", elementalDamageBuffs: 0.25 }),
    ).toBe(1.75);
    expect(
      elementMultiplier({ attacker: "fire", defender: "earth", elementalDamageBuffs: 3 }),
    ).toBe(4.5);
    expect(
      elementMultiplier({ attacker: "fire", defender: "fire", elementalDamageBuffs: 0.5 }),
    ).toBe(1);
  });

  it("gives an advantageous added element the flat 1.5 base without buffs", () => {
    expect(
      elementMultiplier({
        attacker: "fire",
        defender: "water",
        addedElements: ["thunder"],
        elementalDamageBuffs: 0.5,
      }),
    ).toBe(1.5);
  });

  it("removes the ×0.5 penalty when an added element is neutral, keeps it when also resisted", () => {
    expect(
      elementMultiplier({ attacker: "fire", defender: "water", addedElements: ["light"] }),
    ).toBe(1);
    expect(
      elementMultiplier({ attacker: "fire", defender: "water", addedElements: ["fire"] }),
    ).toBe(0.5);
  });

  it("subtracts resistances from the bonus, never below ×1.0", () => {
    // 1 + max(0.5 − 0.2, 0) + max(0.5 − 0.3, 0) = 1.5
    expect(
      elementMultiplier({
        attacker: "light",
        defender: "dark",
        elementalDamageBuffs: 0.5,
        baseResistance: 0.2,
        buffedResistance: 0.3,
      }),
    ).toBeCloseTo(1.5, 12);
    expect(
      elementMultiplier({
        attacker: "light",
        defender: "dark",
        elementalDamageBuffs: 0.5,
        baseResistance: 1,
        buffedResistance: 1,
      }),
    ).toBe(1);
  });
});

describe("element relation", () => {
  it.each(PAIRS)(
    "$attacker vs $defender matches its multiplier",
    ({ attacker, defender, expected }) => {
      const outcome = elementOutcome({ attacker, defender });
      expect(outcome.mult).toBe(expected);
      const relation = expected === 1.5 ? "weak" : expected === 0.5 ? "resist" : undefined;
      expect(outcome.relation).toBe(relation);
    },
  );

  it("marks an added-element weakness and keeps the mark when resistance cancels the bonus", () => {
    expect(
      elementOutcome({ attacker: "fire", defender: "water", addedElements: ["thunder"] }),
    ).toEqual({ mult: 1.5, relation: "weak" });
    expect(
      elementOutcome({
        attacker: "light",
        defender: "dark",
        baseResistance: 1,
        buffedResistance: 1,
      }),
    ).toEqual({ mult: 1, relation: "weak" });
  });

  it("drops the resist mark when a neutral added element lifts the ×0.5 penalty", () => {
    expect(
      elementOutcome({ attacker: "fire", defender: "water", addedElements: ["light"] }),
    ).toEqual({ mult: 1 });
    expect(
      elementOutcome({ attacker: "fire", defender: "water", addedElements: ["fire"] }),
    ).toEqual({ mult: 0.5, relation: "resist" });
  });
});
