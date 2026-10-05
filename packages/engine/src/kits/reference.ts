import type { Element, Rarity } from "@bfr/data";
import type { ActiveEffect } from "../effects/buffs.ts";
import type { AttackStatInput } from "../formulas/attack-stat.ts";

/** Independent, hand-worked expectations; never generated from engine output. */
export interface KitReference {
  unit: string;
  form: string;
  rarities: Rarity[];
  notes: string[];
  contentChecks?: {
    form?: string;
    path: (string | number)[];
    mode: "equal" | "match" | "contain";
    expected: unknown;
  }[];
  damage: {
    tier: "bb" | "sbb";
    seed: number;
    bc: number;
    target: { element: Element; def: number; effectiveDef?: number };
    divisor: number;
    /** Draws consumed by effects before the attack rolls, in order. */
    beforeAttack?: { min: number; max: number; below?: number }[];
    attacks: {
      input: AttackStatInput;
      atkTotal: number;
      core: number;
      distribution: number[];
      hits: number[];
      total: number;
    }[];
    /** Hits from overlapping attacks can interleave. */
    unorderedHits?: boolean;
    unsparked?: boolean;
    spark?: { attack: number; percent: number; multiplier: number; damage: number };
  };
  effectChecks?: {
    scope: "party" | "enemy" | "charged";
    match: Partial<ActiveEffect>;
    count?: number;
  }[];
  effectSets?: {
    match: Partial<ActiveEffect>;
    fields: (keyof ActiveEffect)[];
    expected: unknown[][];
  }[];
  partyBurst?: {
    tier: "ubb";
    bc: number;
    companions: number;
    effects: Partial<ActiveEffect>[];
  };
}
