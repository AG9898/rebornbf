import {
  FUSION_OUTCOMES,
  type FusionOutcome,
  fixedFusionExp,
  fusionZelCost,
  levelForExp,
  ordinaryFusionExp,
  totalExpForLevel,
} from "@bfr/data";
import { isOwnedUnitId, type OwnedUnitRow, unitContent } from "./owned-units.ts";
import {
  FUSION_FODDER_LIMIT,
  type StackQuantities,
  stackQuantitiesProblem,
  stackQuantityTotal,
} from "./unit-stacks.ts";

export type FusionPreview = {
  /**
   * EXP before the server's success roll (M4-06C): the minimum, since a Great (×1.5) or Super (×2)
   * Success raises it. The roll happens only inside `fuse`.
   */
  bbLevel: number;
  sbbLevel: number | null;
  burstDiscarded: number;
  gain: number;
  exp: number;
  level: number;
  cost: number;
  discarded: number;
  /** Why `fuse` would reject this draft, or null (M4-04E: a burst toad into a capped target). */
  problem: string | null;
};

/**
 * Rejects a malformed fusion draft before the RPC: the target, 1–5 fodder copies in total (owned
 * rows plus stacked copies, M4-05C), and well-formed ids and stack quantities.
 */
export function fusionDraftProblem(
  target: string,
  fodder: readonly string[],
  stacks: StackQuantities = {},
): string | null {
  if (!isOwnedUnitId(target)) return "Choose a target unit.";
  const stackProblem = stackQuantitiesProblem(stacks);
  if (stackProblem) return stackProblem;
  const copies = fodder.length + stackQuantityTotal(stacks);
  if (copies < 1 || copies > FUSION_FODDER_LIMIT) return "Choose 1–5 fodder units.";
  if (fodder.some((id) => !isOwnedUnitId(id))) return "Choose valid fodder units.";
  if (new Set(fodder).size !== fodder.length) return "A fodder unit is repeated.";
  if (fodder.includes(target)) return "The target cannot be its own fodder.";
  return null;
}

/** Whether a form gives fusion EXP: fixed `fusionExp`, or any rarity but 1★ (`fodder_fusion_exp`). */
function givesFusionExp(form: { rarity: unknown; fusionExp?: number }): boolean {
  return form.fusionExp !== undefined || form.rarity !== 1;
}

/** Whether a unit form can be fusion fodder at all (the `fuse` RPC rejects the others). */
export function canBeFodder(unitId: string, formId: string): boolean {
  const form = unitContent(unitId)?.forms.find((f) => f.id === formId);
  return form !== undefined && givesFusionExp(form);
}

/**
 * Mirrors M4-01C's deterministic preview, plus burst toads (M4-04E), which add their
 * `fusionEffect.burstLevels` to the duplicate pool. Stacked copies come in as rows, one per copy
 * (`stackCopies`). Ownership, squad safety and payment remain in fuse.
 */
export function fusionPreview(
  target: OwnedUnitRow,
  fodder: readonly OwnedUnitRow[],
): FusionPreview | null {
  const unit = unitContent(target.unit_id);
  const form = unit?.forms.find((f) => f.id === target.form_id);
  if (!unit || !form) return null;
  let gain = 0;
  let burstGain = 0;
  let toads = 0;
  for (const row of fodder) {
    const content = unitContent(row.unit_id);
    const fodderForm = content?.forms.find((f) => f.id === row.form_id);
    if (!content || !fodderForm || !givesFusionExp(fodderForm)) return null;
    const duplicate = row.unit_id === target.unit_id;
    if (duplicate) burstGain += 10;
    const effect = fodderForm.fusionEffect;
    if (typeof effect === "object") {
      // Burst toads share the duplicate pool (M4-04E).
      burstGain += effect.burstLevels;
      toads += 1;
    }
    gain +=
      fodderForm.fusionExp !== undefined
        ? fixedFusionExp(fodderForm.fusionExp, content.element, unit.element, duplicate)
        : ordinaryFusionExp(
            fodderForm.rarity,
            row.level,
            fodderForm.maxLevel,
            content.element,
            unit.element,
            duplicate,
          );
  }
  const curve = unit.expCurve ?? 10;
  const current = Math.max(target.exp, totalExpForLevel(curve, target.level));
  const exp = Math.min(current + gain, totalExpForLevel(curve, form.maxLevel));
  const bbBefore = target.bb_level ?? 1;
  const sbbBefore = target.sbb_level ?? 1;
  const bbGain = Math.min(10 - bbBefore, burstGain);
  const sbbGain = form.bursts.sbb ? Math.min(10 - sbbBefore, burstGain - bbGain) : 0;
  // With BB and SBB capped a toad could only grant SP, which is post-launch (RESOLVED-85).
  const capped = bbBefore >= 10 && (!form.bursts.sbb || sbbBefore >= 10);
  return {
    bbLevel: bbBefore + bbGain,
    sbbLevel: form.bursts.sbb ? sbbBefore + sbbGain : null,
    burstDiscarded: burstGain - bbGain - sbbGain,
    gain,
    exp,
    level: levelForExp(curve, exp, form.maxLevel),
    cost: fusionZelCost(target.level, fodder.length),
    discarded: Math.max(0, current + gain - exp),
    problem:
      toads > 0 && capped
        ? "Burst levels are already capped; a burst toad would have nothing to grant."
        : null,
  };
}

/** Names `fuse`'s server-rolled outcome (M4-06C, RESOLVED-78) and the EXP it gave. */
export function fusionResultMessage(data: unknown): string {
  const result = (data ?? {}) as { outcome?: unknown; exp_gained?: unknown };
  const outcome =
    typeof result.outcome === "string" && Object.hasOwn(FUSION_OUTCOMES, result.outcome)
      ? FUSION_OUTCOMES[result.outcome as FusionOutcome]
      : null;
  if (!outcome || typeof result.exp_gained !== "number")
    return "Fusion complete. Your unit has been updated.";
  return `${outcome.label}! +${result.exp_gained.toLocaleString("en-US")} EXP. Your unit has been updated.`;
}

/** The preview's note that a success roll may raise the EXP shown. */
export const FUSION_MINIMUM_NOTE = `Minimum: a ${FUSION_OUTCOMES.great.label} (×1.5, ${
  FUSION_OUTCOMES.great.rateBp / 100
}%) or ${FUSION_OUTCOMES.super.label} (×2, ${FUSION_OUTCOMES.super.rateBp / 100}%) may give more.`;
