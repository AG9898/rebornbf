import {
  FUSION_OUTCOMES,
  type FusionOutcome,
  fixedFusionExp,
  fusionZelCost,
  levelForExp,
  ordinaryFusionExp,
  type Stats,
  totalExpForLevel,
} from "@bfr/data";
import { isOwnedUnitId, type OwnedUnitRow, unitContent } from "./owned-units.ts";
import {
  FUSION_FODDER_LIMIT,
  FUSION_STACK_SLOT_MAX,
  fusionSlotCount,
  type StackQuantities,
  stackQuantitiesProblem,
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
  /** The imp totals after every stat hob copy, each stopping at the form's cap (M4-04B). */
  imps: Stats;
  /** Whether the second sphere slot is open after the fusion (a Satchel Toad opens it, M4-04D). */
  secondSphereSlot: boolean;
  /**
   * Why `fuse` would reject this draft, or null: a burst toad into a capped target (M4-04E), a stat
   * hob copy that grants nothing (M4-04B), or a second or needless Satchel Toad (M4-04D).
   */
  problem: string | null;
};

/**
 * Rejects a malformed fusion draft before the RPC: the target, 1–5 fodder slots (each owned row is
 * one slot, each stack one slot of 1–99 copies, RESOLVED-90), and well-formed ids.
 */
export function fusionDraftProblem(
  target: string,
  fodder: readonly string[],
  stacks: StackQuantities = {},
): string | null {
  if (!isOwnedUnitId(target)) return "Choose a target unit.";
  const stackProblem = stackQuantitiesProblem(stacks);
  if (stackProblem) return stackProblem;
  const slots = fusionSlotCount(fodder, stacks);
  if (slots < 1 || slots > FUSION_FODDER_LIMIT) return "Choose 1–5 fodder slots.";
  if (Object.values(stacks).some((count) => count > FUSION_STACK_SLOT_MAX)) {
    return "A stack slot holds 1–99 copies.";
  }
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

const IMP_KEYS = ["hp", "atk", "def", "rec"] as const;
const NO_IMPS: Stats = { hp: 0, atk: 0, def: 0, rec: 0 };

/** A fodder form's `{ imps }` gains (stat hobs), or null. */
function hobGains(form: { fusionEffect?: unknown }): Stats | null {
  const effect = form.fusionEffect;
  return typeof effect === "object" && effect !== null && "imps" in effect
    ? (effect as { imps: Stats }).imps
    : null;
}

/** A fodder form's `{ burstLevels }` (burst toads), or 0. */
function toadLevels(form: { fusionEffect?: unknown }): number {
  const effect = form.fusionEffect;
  return typeof effect === "object" && effect !== null && "burstLevels" in effect
    ? (effect as { burstLevels: number }).burstLevels
    : 0;
}

/**
 * Mirrors `fuse`'s deterministic outcome at the plain ×1 rate (M4-01C, M4-01D): EXP with the
 * matching-element and duplicate bonuses, duplicate and burst-toad levels (M4-04E), stat hob
 * totals in the server's unit-id order with its grants-nothing rejection (M4-04B), and the Satchel
 * Toad's sphere slot (M4-04D). Stacked copies come in as rows, one per copy (`stackCopies`).
 * Ownership, squad safety and payment remain in fuse.
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
  let satchels = 0;
  let hobProblem = false;
  const caps = form.impCaps ?? NO_IMPS;
  let imps: Stats = { ...NO_IMPS, ...target.imps };
  // fuse applies hob copies in unit-id order; a copy that changes no total rejects the fusion.
  const ordered = [...fodder].sort((a, b) =>
    a.unit_id < b.unit_id ? -1 : a.unit_id > b.unit_id ? 1 : 0,
  );
  for (const row of ordered) {
    const content = unitContent(row.unit_id);
    const fodderForm = content?.forms.find((f) => f.id === row.form_id);
    if (!content || !fodderForm || !givesFusionExp(fodderForm)) return null;
    const duplicate = row.unit_id === target.unit_id;
    if (duplicate) burstGain += 10;
    const levels = toadLevels(fodderForm);
    if (levels > 0) {
      // Burst toads share the duplicate pool (M4-04E).
      burstGain += levels;
      toads += 1;
    }
    if (fodderForm.fusionEffect === "sphereSlot") satchels += 1;
    const hob = hobGains(fodderForm);
    if (hob) {
      const next = { ...imps };
      for (const key of IMP_KEYS) next[key] = Math.min(imps[key] + hob[key], caps[key]);
      if (IMP_KEYS.every((key) => next[key] === imps[key])) hobProblem = true;
      imps = next;
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
  const slotOpen = target.second_sphere_slot === true;
  const problem = hobProblem
    ? "A stat hob would grant nothing; its stat is already at the cap."
    : satchels > 1
      ? "Feed one Satchel Toad at a time."
      : satchels === 1 && slotOpen
        ? "The second sphere slot is already open."
        : toads > 0 && capped
          ? "Burst levels are already capped; a burst toad would have nothing to grant."
          : null;
  return {
    bbLevel: bbBefore + bbGain,
    sbbLevel: form.bursts.sbb ? sbbBefore + sbbGain : null,
    burstDiscarded: burstGain - bbGain - sbbGain,
    gain,
    exp,
    level: levelForExp(curve, exp, form.maxLevel),
    cost: fusionZelCost(target.level, fodder.length),
    discarded: Math.max(0, current + gain - exp),
    imps,
    secondSphereSlot: slotOpen || satchels === 1,
    problem,
  };
}

/**
 * The no-wasted-pick rule (RESOLVED-90 item 3): whether one more copy of `candidate` still grants
 * something, predicted at the plain ×1 rate over the fodder already picked. EXP counts while the
 * predicted EXP is below the base's max level (so the copy that reaches max is allowed, none
 * after); duplicates and burst toads also while predicted BB or SBB is below 10; stat hobs also
 * while one of their stats' predicted totals is below the form's cap; the Satchel Toad also while
 * the second sphere slot is closed and none is picked. SP is ignored until it ships (RESOLVED-85).
 * A copy that would make `fuse` reject the whole fusion is never allowed.
 */
export function fodderCopyGrants(
  target: OwnedUnitRow,
  fodder: readonly OwnedUnitRow[],
  candidate: OwnedUnitRow,
): boolean {
  const before = fusionPreview(target, fodder);
  const after = fusionPreview(target, [...fodder, candidate]);
  if (!before || !after || after.problem !== null) return false;
  const unit = unitContent(target.unit_id);
  const form = unit?.forms.find((f) => f.id === target.form_id);
  const fodderForm = unitContent(candidate.unit_id)?.forms.find((f) => f.id === candidate.form_id);
  if (!unit || !form || !fodderForm) return false;
  if (before.exp < totalExpForLevel(unit.expCurve ?? 10, form.maxLevel)) return true;
  const burst = candidate.unit_id === target.unit_id || toadLevels(fodderForm) > 0;
  if (burst && (before.bbLevel < 10 || (before.sbbLevel !== null && before.sbbLevel < 10))) {
    return true;
  }
  const hob = hobGains(fodderForm);
  const caps = form.impCaps ?? NO_IMPS;
  if (hob && IMP_KEYS.some((key) => hob[key] > 0 && before.imps[key] < caps[key])) return true;
  // fusionPreview already rejects a second Satchel Toad or an open slot.
  return fodderForm.fusionEffect === "sphereSlot" && !before.secondSphereSlot;
}

/**
 * RESOLVED-90 item 4: a base nothing could improve, so it cannot be chosen for fusion: max level,
 * BB 10 and SBB 10 (or no SBB), second sphere slot open, and all four imp totals at the form's
 * caps (SP 100 joins this once SP ships). Unknown content is not reported as maxed.
 */
export function fusionBaseMaxed(target: OwnedUnitRow): boolean {
  const unit = unitContent(target.unit_id);
  const form = unit?.forms.find((f) => f.id === target.form_id);
  if (!unit || !form) return false;
  const caps = form.impCaps ?? NO_IMPS;
  const imps: Stats = { ...NO_IMPS, ...target.imps };
  return (
    target.level >= form.maxLevel &&
    (target.bb_level ?? 1) >= 10 &&
    (!form.bursts.sbb || (target.sbb_level ?? 1) >= 10) &&
    target.second_sphere_slot === true &&
    IMP_KEYS.every((key) => imps[key] >= caps[key])
  );
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
