import {
  AILMENTS,
  type Ailment,
  type Effect,
  EffectSchema,
  type EnhancementOption,
  type EnhancementPassive,
  type Form,
} from "@bfr/data";
import type { BurstLevels } from "./burst-levels.ts";

/** Frozen SP state; budget is total earned SP, including the cost of chosen options. */
export interface EnhancementSelection {
  readonly optionIds: readonly string[];
  readonly budget: number;
  readonly unlocked: boolean;
}

/**
 * Shared selection/eligibility check for battle setup and future resolvers. Input content must
 * already pass FormSchema. Returns options in prerequisite order, independent of selection order.
 * Explicit-stat snapshots cannot prove level 150 and therefore cannot activate SP.
 */
export function selectedEnhancements(
  form: Form,
  level: number | undefined,
  burstLevels: BurstLevels | undefined,
  selection: EnhancementSelection | undefined,
): EnhancementOption[] {
  if (selection === undefined) return [];
  if (
    !Array.isArray(selection.optionIds) ||
    selection.optionIds.some((id) => typeof id !== "string")
  ) {
    throw new RangeError("optionIds must be an array of content IDs");
  }
  if (typeof selection.unlocked !== "boolean") throw new RangeError("unlocked must be a boolean");
  if (!Number.isInteger(selection.budget) || selection.budget < 0 || selection.budget > 100) {
    throw new RangeError("budget must be an integer 0–100");
  }
  if (selection.unlocked && selection.budget < 10) {
    throw new RangeError("unlocked SP budget must be at least 10");
  }
  const ids = new Set(selection.optionIds);
  if (ids.size !== selection.optionIds.length) throw new RangeError("duplicate option IDs");
  if (ids.size === 0) return [];
  if (
    !selection.unlocked ||
    form.rarity !== "omni" ||
    level !== 150 ||
    (burstLevels?.bb ?? 10) !== 10 ||
    (burstLevels?.sbb ?? 10) !== 10 ||
    !form.bursts.sbb ||
    !form.bursts.ubb
  ) {
    throw new RangeError("SP requires an unlocked level-150 Omni with BB/SBB 10 and UBB");
  }
  const tree = form.enhancements ?? [];
  const byId = new Map(tree.map((option) => [option.id, option]));
  let cost = 0;
  for (const id of ids) {
    const option = byId.get(id);
    if (!option) throw new RangeError(`unknown option "${id}"`);
    if ((option.requires ?? []).some((required) => !ids.has(required))) {
      throw new RangeError(`option "${id}" has an unmet prerequisite`);
    }
    cost += option.cost;
  }
  if (cost > selection.budget) throw new RangeError("selected options exceed SP budget");
  const ordered: EnhancementOption[] = [];
  const visited = new Set<string>();
  const visit = (option: EnhancementOption): void => {
    if (visited.has(option.id)) return;
    visited.add(option.id);
    for (const id of option.requires ?? []) {
      const required = byId.get(id);
      if (required) visit(required);
    }
    ordered.push(option);
  };
  for (const option of tree) if (ids.has(option.id)) visit(option);
  return ordered;
}

/**
 * Catalog grants and supported self-only SP primitives; other primitives fail loudly.
 * Burst changes are left for the burst resolver; their option costs still count in the budget.
 */
export function enhancementPassives(options: readonly EnhancementOption[]): {
  effects: Effect[];
  atkCap?: number;
  angelIdolChance?: number;
  afflictedDamage?: number;
  ailmentCounters: { ailment: Ailment; chance: number }[];
} {
  const grants = new Map<string, EnhancementPassive[]>();
  const supported = (effect: EnhancementPassive): EnhancementPassive => {
    if (
      effect.id === "passive.atk_cap" ||
      effect.id === "passive.angel_idol_once" ||
      effect.id === "passive.afflicted_damage" ||
      effect.id === "passive.ailment_counter"
    )
      return effect;
    const parsed = EffectSchema.safeParse(effect);
    if (!parsed.success) throw new RangeError("unsupported SP passive primitive");
    return parsed.data;
  };
  for (const option of options) {
    grants.set(
      option.id,
      option.changes.flatMap((change) =>
        change.kind === "passive" ? change.effects.map(supported) : [],
      ),
    );
    for (const change of option.changes) {
      if (change.kind !== "passive.replace") continue;
      const original = grants.get(change.option);
      if (!original?.[change.index]) throw new RangeError("missing prerequisite grant");
      original[change.index] = supported(change.effect);
    }
  }
  const effects: Effect[] = [];
  let atkCap: number | undefined;
  let angelIdolChance: number | undefined;
  let afflictedDamage: number | undefined;
  const counterChances = new Map<Ailment, number>();
  for (const effect of [...grants.values()].flat()) {
    if (effect.id === "passive.atk_cap") {
      // Independent cap overrides have no specified precedence; do not invent one.
      if (atkCap !== undefined) throw new RangeError("conflicting SP ATK-cap overrides");
      atkCap = effect.value;
    } else if (effect.id === "passive.angel_idol_once") {
      if (angelIdolChance !== undefined) throw new RangeError("conflicting SP Angel Idol grants");
      angelIdolChance = effect.chance;
    } else if (effect.id === "passive.afflicted_damage") {
      afflictedDamage = (afflictedDamage ?? 0) + effect.value;
    } else if (effect.id === "passive.ailment_counter") {
      counterChances.set(effect.ailment, (counterChances.get(effect.ailment) ?? 0) + effect.chance);
    } else {
      effects.push(EffectSchema.parse(effect));
    }
  }
  return {
    effects,
    ...(atkCap !== undefined ? { atkCap } : {}),
    ...(angelIdolChance !== undefined ? { angelIdolChance } : {}),
    ...(afflictedDamage !== undefined ? { afflictedDamage } : {}),
    ailmentCounters: AILMENTS.flatMap((ailment) => {
      const chance = counterChances.get(ailment) ?? 0;
      return chance > 0 ? [{ ailment, chance: Math.min(100, chance) }] : [];
    }),
  };
}
