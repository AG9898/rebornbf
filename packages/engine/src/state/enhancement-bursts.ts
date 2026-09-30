import {
  type Burst,
  type Effect,
  EffectSchema,
  type EnhancementEffectRef,
  type EnhancementOption,
  type Form,
} from "@bfr/data";

/**
 * Resolve validated, prerequisite-ordered SP options against canonical (level-10) bursts.
 * Replacements are whole effects and durations are absolute totals, never additive bonuses.
 * Call selectedEnhancements first; eligibility requires BB/SBB 10, so no SP values are scaled.
 */
export function formWithEnhancementBursts(form: Form, options: readonly EnhancementOption[]): Form {
  if (
    !options.some((option) => option.changes.some((change) => change.kind.startsWith("burst.")))
  ) {
    return form;
  }
  const copy = (burst: Burst): Burst => ({
    ...burst,
    effects: burst.effects.map((effect) => EffectSchema.parse(effect)),
  });
  const bursts = {
    bb: copy(form.bursts.bb),
    ...(form.bursts.sbb ? { sbb: copy(form.bursts.sbb) } : {}),
    ...(form.bursts.ubb ? { ubb: copy(form.bursts.ubb) } : {}),
  };
  const additions = new Map<string, number[]>();
  const ancestors = new Map<string, Set<string>>();
  const writers = new Map<string, string>();
  const tierBurst = (tier: EnhancementEffectRef["tier"]): Burst => {
    const burst = bursts[tier];
    if (!burst) throw new RangeError("missing enhancement burst tier");
    return burst;
  };
  const referenceIndex = (ref: EnhancementEffectRef): number => {
    const index = ref.addedBy
      ? additions.get(`${ref.addedBy}:${ref.tier}`)?.[ref.index]
      : ref.index;
    if (index === undefined || !tierBurst(ref.tier).effects[index]) {
      throw new RangeError("missing enhancement burst effect");
    }
    return index;
  };
  for (const option of options) {
    const required = new Set<string>();
    for (const id of option.requires ?? []) {
      required.add(id);
      for (const ancestor of ancestors.get(id) ?? []) required.add(ancestor);
    }
    ancestors.set(option.id, required);
    const write = (ref: EnhancementEffectRef, transform: (effect: Effect) => Effect): void => {
      const burst = tierBurst(ref.tier);
      const index = referenceIndex(ref);
      const key = `${ref.tier}:${index}`;
      const previous = writers.get(key);
      // Independent edits have no sourced precedence; never make content order decide it.
      if (previous && previous !== option.id && !required.has(previous)) {
        throw new RangeError("ambiguous SP burst edits require a prerequisite chain (OPEN-32)");
      }
      const original = burst.effects[index];
      if (!original) throw new RangeError("missing enhancement burst effect");
      burst.effects[index] = transform(original);
      writers.set(key, option.id);
    };
    for (const change of option.changes) {
      if (change.kind === "burst.add") {
        const burst = tierBurst(change.tier);
        const key = `${option.id}:${change.tier}`;
        const indices = additions.get(key) ?? [];
        for (const effect of change.effects) {
          indices.push(burst.effects.length);
          burst.effects.push(EffectSchema.parse(effect));
        }
        additions.set(key, indices);
      } else if (change.kind === "burst.replace") {
        write(change.ref, () => EffectSchema.parse(change.effect));
      } else if (change.kind === "burst.duration") {
        for (const ref of change.refs) {
          write(ref, (effect) => {
            if (effect.turns === undefined || effect.turns === 0) {
              throw new RangeError("duration upgrades require a timed effect");
            }
            return { ...effect, turns: change.turns };
          });
        }
      }
    }
  }
  return { ...form, bursts };
}
