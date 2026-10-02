import type { ConditionedEffect, Effect } from "@bfr/data";

type SkillEffect = Effect | ConditionedEffect;
const ELEMENTS = ["Fire", "Water", "Earth", "Thunder", "Light", "Dark"];
const TARGETS = {
  self: "self",
  party: "all allies",
  ally: "one ally",
  enemy: "one enemy",
  enemies: "all enemies",
};
const number = (value: number): string => String(Number(value.toFixed(2)));
const percent = (value: number): string => `${number(value * 100)}%`;
function range(effect: SkillEffect, pct = false): string {
  const format = pct ? percent : number;
  return effect.min === undefined
    ? format(effect.value)
    : `${format(effect.min)}–${format(effect.max ?? effect.min)}`;
}

/** Human-readable kit facts, not copied source descriptions. Values are already level-scaled. */
export function describeEffect(effect: SkillEffect): string {
  const text = effectText(effect);
  const restricted = effect.element && !effect.id.startsWith("attack.") && effect.id !== "barrier";
  const target = restricted
    ? `${effect.element?.[0]?.toUpperCase()}${effect.element?.slice(1)} ${effect.target === "party" ? "allies" : TARGETS[effect.target]}`
    : TARGETS[effect.target];
  const chance = effect.chance === undefined ? "" : `${number(effect.chance)}% chance: `;
  const turns = effect.turns ? ` for ${effect.turns} turn${effect.turns === 1 ? "" : "s"}` : "";
  return `${chance}${text}${effect.id.startsWith("cond.") ? "" : ` (${target})`}${turns}`;
}

function effectText(e: SkillEffect): string {
  const pct = percent(e.value);
  const n = number(e.value);
  if (e.id.startsWith("ailment.inflict.")) return `${n}% chance to inflict ${e.id.slice(16)}`;
  switch (e.id) {
    case "attack.aoe":
    case "attack.st":
    case "attack.random":
    case "attack.hp_scaled":
    case "attack.element_target":
      return `${e.id === "attack.random" ? "Random-target attack" : "Attack"}: ${pct} BB damage modifier${e.hpScaling ? ` + up to ${percent(e.hpScaling)} based on current HP` : ""}${e.element ? ` against ${e.element} enemies only` : ""}${e.flatAtk ? `, +${number(e.flatAtk)} flat ATK` : ""}${e.bcDrop ? `, BC drop rate +${number(e.bcDrop)} percentage points` : ""}${e.critRate ? `, critical rate +${number(e.critRate)} percentage points` : ""}`;
    case "attack.def_ignore":
      return `Ignore enemy DEF (${n}% chance per hit)`;
    case "passive.stat_pct":
      return `${e.stat?.toUpperCase()} +${pct}`;
    case "buff.atk":
      return `ATK +${pct}`;
    case "buff.def":
      return `DEF +${pct}`;
    case "buff.rec":
      return `REC +${pct}`;
    case "buff.crit_rate":
      return `Critical rate +${pct}`;
    case "buff.crit_dmg":
      return `Critical damage +${pct}`;
    case "buff.spark_dmg":
      return `Spark damage +${pct}`;
    case "buff.elem_weak_dmg":
      return `Elemental weakness damage +${pct}`;
    case "buff.bb_atk":
      return `BB/SBB/UBB damage +${pct}`;
    case "buff.atk_from_def":
      return `Add ${pct} of DEF to ATK`;
    case "buff.spark_crit":
      return `Critical sparks: spark damage +${pct}`;
    case "buff.add_element":
      return `Add ${ELEMENTS[e.value] ?? "additional"} element to attacks`;
    case "buff.add_ailment":
      return `Attacks have a ${n}% chance to inflict ${e.ailment}`;
    case "heal.instant":
    case "heal.over_time":
      return `Recover ${range(e)} HP${e.id === "heal.instant" ? " + recipient REC" : ""}${e.recBonus ? ` + ${percent(e.recBonus)} of healer REC` : ""}${e.id === "heal.over_time" ? " each turn" : ""}`;
    case "mitigation":
      return `Reduce damage taken by ${pct}`;
    case "elemental_mitigation":
      return `Reduce damage from enemies' own-element attacks by ${pct}`;
    case "angel_idol":
      return `Survive lethal damage once with ${pct} HP`;
    case "damage_to_heal":
      return `Recover ${range(e, true)} of damage taken as HP`;
    case "chance_mitigation":
      return `Reduce damage taken by ${pct}`;
    case "mitigation_after_damage":
      return `Reduce damage taken by ${pct} after taking ${e.threshold} damage this turn`;
    case "barrier":
      return `${e.element ? `${e.element} barrier` : "Barrier"}: ${n} HP`;
    case "crit_resist":
      return `Reduce bonus critical damage by ${pct}`;
    case "elem_weak_resist":
      return `Reduce bonus elemental weakness damage by ${pct}`;
    case "guard_mitigation":
      return `Additional guard damage reduction +${pct}`;
    case "hp_drain":
      return `Recover ${range(e, true)} of damage dealt as HP`;
    case "damage_reflect":
      return `Reflect ${pct} of damage taken`;
    case "bb.fill_instant":
      return e.value >= 999 ? "Fill BB gauge completely" : `Fill BB gauge by ${n} BC`;
    case "bb.fill_per_turn":
    case "passive.bc_per_turn":
      return `Fill BB gauge by ${n} BC each turn`;
    case "bb.fill_rate":
    case "bc.efficacy":
      return `BB gauge gain from BC +${pct}`;
    case "bb.fill_on_hit":
      return `Fill BB gauge by ${range(e)} BC per damaging enemy attack`;
    case "bb.fill_on_spark":
      return `Fill BB gauge by ${range(e)} BC per spark`;
    case "bb.fill_on_attack":
      return `Fill BB gauge by ${n} BC when attacking`;
    case "bb.fill_on_guard":
      return `Fill BB gauge by ${n} BC when guarding`;
    case "bb.fill_on_damage_taken":
      return `Fill BB gauge by ${n} BC per ${e.threshold} damage taken this turn (at most once per hit)`;
    case "bb.fill_on_damage_dealt":
      return `Fill BB gauge by ${n} BC per ${e.threshold} damage dealt this turn (at most once per hit)`;
    case "bb.cost_reduction":
      return `BB/SBB/UBB gauge cost −${pct}`;
    case "bb.consumption_reduction":
      return `Refund ${range(e, true)} of BB/SBB/UBB gauge cost`;
    case "bb.level_scaling":
      return `Burst level scaling +${pct}`;
    case "od.fill_rate":
      return `Overdrive gauge fill rate +${pct}`;
    case "od.fill_instant":
      return `Fill Overdrive gauge by ${pct}`;
    case "drop.bc":
      return `BC drop rate +${n} percentage points`;
    case "drop.hc":
      return `HC drop rate +${n} percentage points`;
    case "drop.item":
      return `Item drop rate +${n} percentage points`;
    case "drop.zel":
      return `Zel drops +${n}%`;
    case "hc.efficacy":
      return `HC healing +${pct}`;
    case "ailment.cure":
      return "Cure all status ailments";
    case "ailment.null":
      return "Prevent status ailments";
    case "debuff.null":
      return "Prevent debuffs";
    case "debuff.atk_down":
      return `Reduce ATK by ${pct}`;
    case "debuff.def_down":
      return `Reduce DEF by ${pct}`;
    case "debuff.spark_vuln":
      return `Spark damage taken +${pct}`;
    case "debuff.dot":
      return `Damage each turn: ${pct} ATK${e.flatAtk ? ` + ${e.flatAtk} flat ATK` : ""}`;
    case "hits.add_normal":
      return `Add ${n} normal-attack hits${e.damageBonus === undefined ? "" : `, each at ${percent(1 + e.damageBonus)} damage`}`;
    case "passive.exp_gain":
      return `EXP gained +${pct}`;
    case "passive.atk_hp_scaled":
      return `ATK +${pct} + up to ${percent(e.hpScaling ?? 0)} based on current HP`;
    case "cond.hp_above":
    case "cond.hp_below":
    case "cond.bb_above":
    case "cond.first_turns":
    case "cond.signature_sphere":
    case "cond.after_hc_collected":
    case "cond.sphere_type_equipped": {
      const conditions = {
        "cond.hp_above": `While HP is above ${pct}`,
        "cond.hp_below": `While HP is below ${pct}`,
        "cond.bb_above": `While BB gauge is above ${pct}`,
        "cond.first_turns": `During the first ${n} turns`,
        "cond.signature_sphere": "While the unit's signature sphere is equipped",
        "cond.after_hc_collected": `After collecting ${n} HC`,
        "cond.sphere_type_equipped": "While the required sphere type is equipped",
      };
      return `${conditions[e.id]}: ${("effects" in e ? e.effects : [])?.map(describeEffect).join("; ")}`;
    }
  }
  throw new Error(`Missing skill description: ${e.id}`);
}
