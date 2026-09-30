import {
  fixedFusionExp,
  fusionZelCost,
  levelForExp,
  ordinaryFusionExp,
  totalExpForLevel,
} from "@bfr/data";
import { isOwnedUnitId, type OwnedUnitRow, unitContent } from "./owned-units.ts";

export type FusionPreview = {
  bbLevel: number;
  sbbLevel: number | null;
  burstDiscarded: number;
  gain: number;
  exp: number;
  level: number;
  cost: number;
  discarded: number;
};

export function fusionDraftProblem(target: string, fodder: readonly string[]): string | null {
  if (!isOwnedUnitId(target)) return "Choose a target unit.";
  if (fodder.length < 1 || fodder.length > 5) return "Choose 1–5 fodder units.";
  if (fodder.some((id) => !isOwnedUnitId(id))) return "Choose valid fodder units.";
  if (new Set(fodder).size !== fodder.length) return "A fodder unit is repeated.";
  if (fodder.includes(target)) return "The target cannot be its own fodder.";
  return null;
}

/** Mirrors M4-01C's deterministic preview. Ownership, squad safety and payment remain in fuse. */
export function fusionPreview(
  target: OwnedUnitRow,
  fodder: readonly OwnedUnitRow[],
): FusionPreview | null {
  const unit = unitContent(target.unit_id);
  const form = unit?.forms.find((f) => f.id === target.form_id);
  if (!unit || !form) return null;
  let gain = 0;
  let burstGain = 0;
  for (const row of fodder) {
    const content = unitContent(row.unit_id);
    const fodderForm = content?.forms.find((f) => f.id === row.form_id);
    if (!content || !fodderForm || fodderForm.rarity === 1) return null;
    const duplicate = row.unit_id === target.unit_id;
    if (duplicate) burstGain += 10;
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
  return {
    bbLevel: bbBefore + bbGain,
    sbbLevel: form.bursts.sbb ? sbbBefore + sbbGain : null,
    burstDiscarded: burstGain - bbGain - sbbGain,
    gain,
    exp,
    level: levelForExp(curve, exp, form.maxLevel),
    cost: fusionZelCost(target.level, fodder.length),
    discarded: Math.max(0, current + gain - exp),
  };
}
