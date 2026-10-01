import { isCursed, isParalyzed } from "./effects/ailments.ts";
import { gaugeModifiersFromEffects } from "./effects/gauge.ts";
import { canBurst, isOdFull } from "./gauge/index.ts";
import type {
  AutoSettings,
  AutoUnitMode,
  BattleState,
  BattleUnit,
  EnemySlotId,
} from "./state/types.ts";
import type { BattleInput, BurstTier } from "./timeline/types.ts";

/** Burst tiers auto mode tries, highest first. */
const AUTO_TIERS: readonly BurstTier[] = ["ubb", "sbb", "bb"];

export interface AutoOptions {
  /** Selected enemy sent with every action; omitted, the engine picks the first living enemy. */
  readonly target?: EnemySlotId;
}

/**
 * The highest burst tier `unit` can use right now (UBB in Overdrive Mode, then SBB, then BB), or
 * `undefined` when none is charged or the unit is Cursed. Mirrors the engine's burst checks.
 */
export function autoBurstTier(unit: BattleUnit): BurstTier | undefined {
  return AUTO_TIERS.find((tier) => charged(unit, tier, unit.overdrive));
}

/** Whether `unit` could use `tier` now (with `overdrive` as its Overdrive Mode state). */
function charged(unit: BattleUnit, tier: BurstTier, overdrive: boolean): boolean {
  if (isCursed(unit.effects)) return false;
  const modifiers = gaugeModifiersFromEffects(unit.effects);
  return canBurst(unit.form, tier, unit.bc, overdrive, modifiers);
}

/** BB/SBB use: the SBB when charged, else the BB, else nothing. Never the UBB. */
function bbOrSbb(unit: BattleUnit): BurstTier | undefined {
  return (["sbb", "bb"] as const).find((tier) => charged(unit, tier, false));
}

/** One unit's auto turn: whether it enters Overdrive first, and the action it then takes. */
interface UnitPlan {
  readonly overdrive: boolean;
  readonly action: "attack" | "guard" | BurstTier;
}

/**
 * The OD & UBB path (Auto with OD & UBB Priority, UBB mode with Forced BB Priority): a UBB-capable
 * unit enters Overdrive Mode when the OD gauge is full and still free this phase, then uses its UBB
 * once charged; meanwhile it normally attacks. Returns `undefined` for a unit with no UBB.
 */
function overdrivePlan(unit: BattleUnit, odFree: boolean): UnitPlan | undefined {
  if (!unit.form.bursts.ubb) return undefined;
  const overdrive = !unit.overdrive && odFree;
  if (!unit.overdrive && !overdrive) return undefined;
  return { overdrive, action: charged(unit, "ubb", true) ? "ubb" : "attack" };
}

function unitPlan(
  unit: BattleUnit,
  mode: AutoUnitMode,
  settings: AutoSettings,
  odFree: boolean,
): UnitPlan {
  const forced = settings.forcedBbPriority === true;
  const act = (tier: BurstTier | undefined): UnitPlan => ({
    overdrive: false,
    action: tier ?? "attack",
  });
  switch (mode) {
    case "guard":
      return { overdrive: false, action: "guard" };
    case "attack":
      return act(undefined);
    case "bb":
      return act(forced ? (charged(unit, "bb", false) ? "bb" : undefined) : bbOrSbb(unit));
    case "sbb":
      return act(forced ? (charged(unit, "sbb", false) ? "sbb" : undefined) : bbOrSbb(unit));
    case "ubb":
      return forced ? (overdrivePlan(unit, odFree) ?? act(undefined)) : act(bbOrSbb(unit));
    case "auto": {
      const od = settings.odUbbPriority === true ? overdrivePlan(unit, odFree) : undefined;
      if (od) return od;
      if (settings.sbbPriority === true && unit.form.bursts.sbb) {
        return act(charged(unit, "sbb", false) ? "sbb" : undefined);
      }
      return act(bbOrSbb(unit));
    }
  }
}

/**
 * Auto-battle (GAME_DESIGN §2 → Auto-battle and its advanced settings; RESOLVED-17, M1-08E): one
 * action per unit that can still act this player phase, in squad order (ally last), all at
 * `state.tick`, following the setup's Auto Battle Advance Settings (`state.autoSettings`). With no
 * settings every unit is in Auto mode: SBB when charged, else BB, else a normal attack, and never
 * the UBB. A unit taking the OD & UBB path is preceded by its `overdrive` input; the full OD gauge
 * goes to the first such unit only. Dead, paralyzed, and already-acted units are skipped. Pure: the
 * output is ordinary `BattleInput`s, so an auto turn replays exactly like a manual one. Returns `[]`
 * once the battle is over.
 */
export function autoInputs(state: BattleState, options: AutoOptions = {}): BattleInput[] {
  if (state.result !== undefined) return [];
  const settings = state.autoSettings ?? {};
  const target = options.target === undefined ? {} : { target: options.target };
  let odFree = isOdFull(state.od);
  const inputs: BattleInput[] = [];
  for (const unit of state.party) {
    if (unit.hp <= 0 || state.acted.includes(unit.slot) || isParalyzed(unit.effects)) continue;
    const plan = unitPlan(unit, settings.modes?.[unit.slot] ?? "auto", settings, odFree);
    const base = { tick: state.tick, actor: unit.slot };
    if (plan.overdrive) {
      odFree = false;
      inputs.push({ type: "overdrive", ...base });
    }
    if (plan.action === "guard") inputs.push({ type: "guard", ...base });
    else if (plan.action === "attack") inputs.push({ type: "attack", ...base, ...target });
    else inputs.push({ type: "burst", ...base, tier: plan.action, ...target });
  }
  return inputs;
}
