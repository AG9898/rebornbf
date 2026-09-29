import type { Element } from "@bfr/data";

/** Base multiplier when the attack's element is strong against the target (GAME_DESIGN §1). */
export const ELEMENT_STRONG_BASE = 1.5;
/** Multiplier when the attack hits only with an element the target resists. */
export const ELEMENT_WEAK_MULT = 0.5;

/** Wheel: fire → earth → thunder → water → fire; light ↔ dark (arrow = "is strong against"). */
const STRONG_AGAINST: Readonly<Record<Element, readonly Element[]>> = {
  fire: ["earth"],
  earth: ["thunder"],
  thunder: ["water"],
  water: ["fire"],
  light: ["dark"],
  dark: ["light"],
};

/** True when `attacker` is strong against `defender`. */
export function isStrongAgainst(attacker: Element, defender: Element): boolean {
  return STRONG_AGAINST[attacker].includes(defender);
}

export interface ElementMultiplierInput {
  /** The attacker's own element. */
  readonly attacker: Element;
  readonly defender: Element;
  /** Elements added by `buff.add_element`. */
  readonly addedElements?: readonly Element[];
  /** Elemental-damage buffs (`buff.elem_weak_dmg`) as a fraction; own element only. */
  readonly elementalDamageBuffs?: number;
  /** Enemy base resistance to elemental damage (fraction; 0 unless data defines it). */
  readonly baseResistance?: number;
  /** Enemy resistance to buffed elemental damage (fraction). */
  readonly buffedResistance?: number;
}

/**
 * How an attack's element met the target, for presentation: `"weak"` when the strong branch of
 * `elementMultiplier` applied (own or added element strong against the target), `"resist"` when
 * the ×0.5 branch applied, absent when neutral. Engine events carry it so the renderer can show
 * weakness/resist arrows without computing the element wheel itself.
 */
export type ElementRelation = "weak" | "resist";

/** The multiplier and which branch of the element rule produced it. */
export interface ElementOutcome {
  readonly mult: number;
  readonly relation?: ElementRelation;
}

/**
 * Element multiplier, decided once per attack (GAME_DESIGN §1):
 * - own element strong: `1 + max(0.5 − base_res, 0) + max(buffs − buffed_res, 0)`;
 * - else an added element strong: the flat base, `1 + max(0.5 − base_res, 0)` (no buffs);
 * - else own element weak and every added element also weak: ×0.5;
 * - otherwise ×1.0.
 */
export function elementOutcome(input: ElementMultiplierInput): ElementOutcome {
  const {
    attacker,
    defender,
    addedElements = [],
    elementalDamageBuffs = 0,
    baseResistance = 0,
    buffedResistance = 0,
  } = input;
  const baseBonus = Math.max(ELEMENT_STRONG_BASE - 1 - baseResistance, 0);
  if (isStrongAgainst(attacker, defender)) {
    return {
      mult: 1 + baseBonus + Math.max(elementalDamageBuffs - buffedResistance, 0),
      relation: "weak",
    };
  }
  if (addedElements.some((element) => isStrongAgainst(element, defender))) {
    return { mult: 1 + baseBonus, relation: "weak" };
  }
  const weak = (element: Element) => isStrongAgainst(defender, element);
  if (weak(attacker) && addedElements.every(weak)) {
    return { mult: ELEMENT_WEAK_MULT, relation: "resist" };
  }
  return { mult: 1 };
}

/** The element multiplier alone (see `elementOutcome`). */
export function elementMultiplier(input: ElementMultiplierInput): number {
  return elementOutcome(input).mult;
}
