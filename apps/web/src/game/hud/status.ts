import type { EffectId } from "@bfr/data";
import type { BattleUiPiece } from "../assets/ui.ts";

/** A round 32 px status badge (ART_GUIDE.md → Battle HUD art): ailment, buff, or debuff. */
export type StatusBadge = Extract<
  BattleUiPiece,
  `status-${string}` | `buff-${string}` | `debuff-${string}`
>;

/**
 * The one table from engine effect IDs to status badges (M2-07B). Several IDs can share a badge
 * (every crit buff shows `buff-crit`). IDs not listed here — attack shapes, one-shot heals and
 * fills, cures, conditions, passives — show nothing.
 */
export const STATUS_BADGES: Readonly<Partial<Record<EffectId, StatusBadge>>> = {
  "ailment.inflict.poison": "status-poison",
  "ailment.inflict.weak": "status-weak",
  "ailment.inflict.sick": "status-sick",
  "ailment.inflict.injury": "status-injury",
  "ailment.inflict.curse": "status-curse",
  "ailment.inflict.paralysis": "status-paralysis",
  "buff.atk": "buff-atk",
  "buff.atk_from_def": "buff-atk",
  "buff.def": "buff-def",
  "buff.rec": "buff-rec",
  "buff.crit_rate": "buff-crit",
  "buff.crit_dmg": "buff-crit",
  "buff.spark_dmg": "buff-spark",
  "buff.spark_crit": "buff-spark",
  "buff.bb_atk": "buff-bb-atk",
  "buff.add_element": "buff-element",
  "buff.elem_weak_dmg": "buff-element",
  "heal.over_time": "buff-regen",
  mitigation: "buff-mitigation",
  chance_mitigation: "buff-mitigation",
  elemental_mitigation: "buff-elem-guard",
  elem_weak_resist: "buff-elem-guard",
  barrier: "buff-barrier",
  angel_idol: "buff-last-stand",
  "bb.fill_per_turn": "buff-gauge-fill",
  "bb.fill_on_hit": "buff-gauge-fill",
  "bb.fill_on_guard": "buff-gauge-fill",
  "bb.fill_on_damage_taken": "buff-gauge-fill",
  "bb.fill_on_damage_dealt": "buff-gauge-fill",
  "bb.fill_on_spark": "buff-gauge-fill",
  "bb.fill_rate": "buff-gauge-rate",
  "bc.efficacy": "buff-gauge-rate",
  "drop.bc": "buff-drop-rate",
  "drop.hc": "buff-drop-rate",
  "drop.item": "buff-drop-rate",
  "drop.zel": "buff-drop-rate",
  "debuff.atk_down": "debuff-atk",
  "debuff.def_down": "debuff-def",
  "debuff.spark_vuln": "debuff-spark-vuln",
  "debuff.dot": "debuff-dot",
};

/** Every badge texture, for preloading. */
export const STATUS_BADGE_PIECES: readonly StatusBadge[] = [
  ...new Set(Object.values(STATUS_BADGES)),
];

/** At most this many badges are drawn over one combatant. */
export const MAX_BADGES = 4;

/**
 * The badges for a combatant's active effect IDs (from `HudState`): ailments first, then buffs,
 * then debuffs, each in application order, without repeats, capped at `MAX_BADGES`.
 */
export function statusBadges(effects: readonly EffectId[]): StatusBadge[] {
  const badges = [
    ...new Set(effects.flatMap((id) => (STATUS_BADGES[id] ? [STATUS_BADGES[id]] : []))),
  ];
  const rank = (badge: StatusBadge) =>
    badge.startsWith("status-") ? 0 : badge.startsWith("buff-") ? 1 : 2;
  return badges.sort((a, b) => rank(a) - rank(b)).slice(0, MAX_BADGES);
}
