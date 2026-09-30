import { z } from "zod";
import { ElementSchema, NonNegativeIntSchema } from "./common.ts";

/**
 * Effect catalog (GAME_DESIGN §4). Every ID here needs a catalog row in GAME_DESIGN.md and,
 * once implemented, an engine handler with a unit test.
 */
export const EFFECT_IDS = [
  // Attack
  "attack.aoe",
  "attack.st",
  "attack.random",
  "attack.hp_scaled",
  "attack.def_ignore",
  "attack.element_target",
  // Stat buffs
  "buff.atk",
  "buff.def",
  "buff.rec",
  "buff.crit_rate",
  "buff.crit_dmg",
  "buff.spark_dmg",
  "buff.elem_weak_dmg",
  "buff.add_element",
  "buff.bb_atk",
  "buff.atk_from_def",
  "buff.spark_crit",
  "buff.add_ailment",
  // Survival
  "heal.instant",
  "heal.over_time",
  "mitigation",
  "elemental_mitigation",
  "angel_idol",
  "damage_to_heal",
  "chance_mitigation",
  "mitigation_after_damage",
  "barrier",
  "crit_resist",
  "guard_mitigation",
  "hp_drain",
  "elem_weak_resist",
  "damage_reflect",
  // Burst level
  "bb.level_scaling",
  // Gauge
  "bb.fill_instant",
  "bb.fill_per_turn",
  "bb.fill_rate",
  "bb.fill_on_hit",
  "bb.fill_on_attack",
  "bb.fill_on_guard",
  "bb.fill_on_damage_taken",
  "bb.fill_on_spark",
  "bb.fill_on_damage_dealt",
  "bb.cost_reduction",
  "bb.consumption_reduction",
  "od.fill_rate",
  "od.fill_instant",
  // Drops
  "drop.bc",
  "drop.hc",
  "drop.item",
  "drop.zel",
  "hc.efficacy",
  "bc.efficacy",
  // Status
  "ailment.inflict.poison",
  "ailment.inflict.weak",
  "ailment.inflict.sick",
  "ailment.inflict.injury",
  "ailment.inflict.curse",
  "ailment.inflict.paralysis",
  "ailment.cure",
  "ailment.null",
  "debuff.atk_down",
  "debuff.def_down",
  "debuff.spark_vuln",
  "debuff.dot",
  "debuff.null",
  // Hit count
  "hits.add_normal",
  // Conditional
  "cond.hp_above",
  "cond.hp_below",
  "cond.after_hc_collected",
  "cond.sphere_type_equipped",
  "cond.first_turns",
  "cond.signature_sphere",
  "cond.bb_above",
  // Passive stat
  "passive.stat_pct",
  "passive.exp_gain",
  "passive.bc_per_turn",
  "passive.atk_hp_scaled",
] as const;

export const EffectIdSchema = z.enum(EFFECT_IDS, {
  error: (issue) => `unknown effect ID ${JSON.stringify(issue.input)} (see GAME_DESIGN §4)`,
});
export type EffectId = z.infer<typeof EffectIdSchema>;

/** Who an effect applies to. */
export const EFFECT_TARGETS = ["self", "party", "ally", "enemy", "enemies"] as const;
export const EffectTargetSchema = z.enum(EFFECT_TARGETS);
export type EffectTarget = z.infer<typeof EffectTargetSchema>;

/**
 * Attack-shape IDs: each describes one of a burst's (or enemy skill's) frame-timed attacks, in
 * order — its area and BB damage modifier (GAME_DESIGN §4 → Attack effects).
 */
export const ATTACK_SHAPE_IDS = [
  "attack.aoe",
  "attack.st",
  "attack.random",
  "attack.hp_scaled",
  "attack.element_target",
] as const satisfies readonly EffectId[];
export type AttackShapeId = (typeof ATTACK_SHAPE_IDS)[number];

export function isAttackShapeId(id: EffectId): id is AttackShapeId {
  return (ATTACK_SHAPE_IDS as readonly string[]).includes(id);
}

/** Targets each attack shape allows: `enemies` hits every foe, `enemy` the selected one. */
const SHAPE_TARGETS: Readonly<Record<AttackShapeId, readonly EffectTarget[]>> = {
  "attack.aoe": ["enemies"],
  "attack.st": ["enemy"],
  "attack.random": ["enemies"],
  "attack.hp_scaled": ["enemy", "enemies"],
  "attack.element_target": ["enemy", "enemies"],
};

/** Status ailments (GAME_DESIGN §4 → Ailments and debuffs), one per `ailment.inflict.*` ID. */
export const AILMENTS = ["poison", "weak", "sick", "injury", "curse", "paralysis"] as const;
export const AilmentSchema = z.enum(AILMENTS);
export type Ailment = z.infer<typeof AilmentSchema>;

/** Stats a `passive.stat_pct` effect can raise (GAME_DESIGN §4 → Passives and conditions). */
export const PASSIVE_STATS = ["hp", "atk", "def", "rec"] as const;
export const PassiveStatSchema = z.enum(PASSIVE_STATS);
export type PassiveStat = z.infer<typeof PassiveStatSchema>;

const effectFields = {
  id: EffectIdSchema,
  value: z.number(),
  turns: NonNegativeIntSchema.optional(),
  target: EffectTargetSchema,
  /** `passive.stat_pct` only (required there): the stat raised. */
  stat: PassiveStatSchema.optional(),
  /**
   * `passive.stat_pct`, `buff.elem_weak_dmg`: limits the effect to units of this element.
   * `attack.element_target` (required there): the only element the attack connects with.
   */
  element: ElementSchema.optional(),
  /**
   * `attack.hp_scaled`, `passive.atk_hp_scaled` only (required there): amount added ×
   * (current HP / max HP).
   */
  hpScaling: z.number().nonnegative().optional(),
  /**
   * Attack shapes: the attack's flat ATK bonus, added to base ATK (GAME_DESIGN §3).
   * `debuff.dot`: the damage-over-time flat ATK term.
   */
  flatAtk: z.number().nonnegative().optional(),
  /**
   * Attack shapes only: the attack's own BC drop-rate bonus in % points, the `inherent` term of
   * the BC drop rate (GAME_DESIGN §2), carried on each of the attack's hits.
   */
  bcDrop: z.number().nonnegative().optional(),
  /**
   * Attack shapes only: the attack's own critical-rate bonus in % points (proc 1 `bb crit%`),
   * added to the attacker's crit-rate buffs for that attack (GAME_DESIGN §2 Critical hits).
   */
  critRate: z.number().nonnegative().optional(),
  /** `buff.add_ailment` only (required there): the ailment the buffed unit's attacks inflict. */
  ailment: AilmentSchema.optional(),
  /** `hits.add_normal` only: extra-hit damage bonus; each extra hit deals ×(1 + bonus). */
  damageBonus: z.number().min(-1).optional(),
  /**
   * `heal.instant`, `heal.over_time` (HP, integers), `bb.fill_on_spark` and `bb.fill_on_hit` (BC, integers),
   * `damage_to_heal` (share of damage), `bb.consumption_reduction` (share of the BB cost), and
   * `hp_drain` (share of damage dealt; all three whole percents as fractions): the RandomBetween(min, max) range. `min` and `max` come together, and
   * `value` must then be 0 (the range replaces it).
   */
  min: z.number().nonnegative().optional(),
  max: z.number().nonnegative().optional(),
  /** `heal.instant`, `heal.over_time` only: healer REC bonus fraction (27% → 0.27). */
  recBonus: z.number().nonnegative().optional(),
  /**
   * `damage_to_heal`, `angel_idol`, `debuff.atk_down`, `debuff.def_down`, `debuff.spark_vuln`,
   * `hp_drain`, `chance_mitigation`, `buff.spark_crit`, and `damage_reflect` (required on those three) only: proc chance % in
   * (0, 100]; omitted means always.
   */
  chance: z.number().gt(0).max(100).optional(),
  /**
   * `bb.fill_on_damage_taken`, `mitigation_after_damage` (damage taken), and
   * `bb.fill_on_damage_dealt` (damage dealt) only (required there): the damage that triggers the
   * effect (GAME_DESIGN §4 → Kit additions (M2-04C), (M2-04F)).
   */
  threshold: z.number().int().positive().optional(),
};

interface EffectFieldsInput {
  readonly id: EffectId;
  readonly value: number;
  readonly target: EffectTarget;
  readonly stat?: unknown;
  readonly element?: unknown;
  readonly hpScaling?: unknown;
  readonly flatAtk?: unknown;
  readonly bcDrop?: unknown;
  readonly critRate?: unknown;
  readonly ailment?: unknown;
  readonly damageBonus?: unknown;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  readonly recBonus?: unknown;
  readonly chance?: unknown;
  readonly threshold?: unknown;
  readonly effects?: unknown;
}

/** Allows `field` only on `ids`, and requires it on `required`. */
function checkField(
  effect: EffectFieldsInput,
  ctx: z.RefinementCtx,
  field:
    | "element"
    | "hpScaling"
    | "flatAtk"
    | "bcDrop"
    | "critRate"
    | "ailment"
    | "damageBonus"
    | "min"
    | "max"
    | "recBonus"
    | "chance"
    | "threshold",
  ids: readonly EffectId[],
  required: readonly EffectId[] = [],
): void {
  const present = effect[field] !== undefined;
  if (!present && required.includes(effect.id)) {
    ctx.addIssue({ code: "custom", path: [field], message: `${effect.id} needs ${field}` });
  }
  if (present && !ids.includes(effect.id)) {
    ctx.addIssue({ code: "custom", path: [field], message: `not allowed on ${effect.id}` });
  }
}

/** Attack shapes, DEF ignore, and extra normal hits constrain their target and value. */
function checkAttackEffect(effect: EffectFieldsInput, ctx: z.RefinementCtx): void {
  const { id, value, target } = effect;
  if (isAttackShapeId(id)) {
    if (!SHAPE_TARGETS[id].includes(target)) {
      ctx.addIssue({
        code: "custom",
        path: ["target"],
        message: `${id} targets ${SHAPE_TARGETS[id].join(" or ")}`,
      });
    }
    if (value < 0) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "BB modifier must be ≥ 0" });
    }
    return;
  }
  if (id !== "attack.def_ignore" && id !== "hits.add_normal") return;
  if (target === "enemy" || target === "enemies") {
    ctx.addIssue({ code: "custom", path: ["target"], message: `${id} targets allies` });
  }
  if (id === "attack.def_ignore" && !(value > 0 && value <= 100)) {
    ctx.addIssue({ code: "custom", path: ["value"], message: "chance must be in (0, 100]" });
  }
  if (id === "hits.add_normal" && !(Number.isInteger(value) && value >= 1)) {
    ctx.addIssue({ code: "custom", path: ["value"], message: "extra hits must be an integer ≥ 1" });
  }
}

const HEAL_IDS = ["heal.instant", "heal.over_time"] as const satisfies readonly EffectId[];
const RANGE_IDS = [
  ...HEAL_IDS,
  "damage_to_heal",
  "bb.fill_on_spark",
  "bb.fill_on_hit",
  "bb.consumption_reduction",
  "bb.fill_on_attack",
  "hp_drain",
] as const satisfies readonly EffectId[];
/** Range IDs whose `min`/`max` are whole percents written as fractions, not integers. */
const PERCENT_RANGE_IDS: readonly EffectId[] = [
  "damage_to_heal",
  "bb.consumption_reduction",
  "hp_drain",
];

/** True when `x` is a whole percent written as a fraction (0.35 → 35%). */
function isWholePercent(x: number): boolean {
  return Math.abs(x * 100 - Math.round(x * 100)) < 1e-9;
}

/**
 * Multi-parameter survival fields (RESOLVED-34): heal ranges, healer REC bonus, and proc chance
 * (GAME_DESIGN §4 → Survival effects).
 */
function checkSurvivalFields(effect: EffectFieldsInput, ctx: z.RefinementCtx): void {
  checkField(effect, ctx, "min", RANGE_IDS);
  checkField(effect, ctx, "max", RANGE_IDS);
  checkField(effect, ctx, "recBonus", HEAL_IDS);
  checkField(
    effect,
    ctx,
    "chance",
    [
      "damage_to_heal",
      "angel_idol",
      "chance_mitigation",
      "debuff.atk_down",
      "debuff.def_down",
      "debuff.spark_vuln",
      "buff.spark_crit",
      "hp_drain",
      "damage_reflect",
    ],
    ["chance_mitigation", "buff.spark_crit", "damage_reflect"],
  );
  const { min, max } = effect;
  if (!(RANGE_IDS as readonly EffectId[]).includes(effect.id)) return;
  if ((min === undefined) !== (max === undefined)) {
    ctx.addIssue({ code: "custom", path: ["max"], message: "min and max come together" });
    return;
  }
  if (min === undefined || max === undefined) return;
  if (min > max) {
    ctx.addIssue({ code: "custom", path: ["max"], message: "max must be ≥ min" });
  }
  if (effect.value !== 0) {
    ctx.addIssue({ code: "custom", path: ["value"], message: "must be 0 when min/max are set" });
  }
  const whole = !PERCENT_RANGE_IDS.includes(effect.id);
  const valid = whole
    ? Number.isInteger(min) && Number.isInteger(max)
    : isWholePercent(min) && isWholePercent(max);
  if (!valid) {
    ctx.addIssue({
      code: "custom",
      path: ["min"],
      message: whole ? "heal/BC range must be integers" : "share range must be whole percents",
    });
  }
}

/**
 * A burst or enemy skill describes each frame-timed attack with one attack-shape effect, in
 * order (GAME_DESIGN §4 → Attack effects).
 */
export function checkAttackShapes(
  attackCount: number,
  effects: readonly { readonly id: EffectId }[],
  ctx: z.RefinementCtx,
): void {
  const shapes = effects.filter((effect) => isAttackShapeId(effect.id)).length;
  if (shapes !== attackCount) {
    ctx.addIssue({
      code: "custom",
      path: ["effects"],
      message: `has ${shapes} attack-shape effects but ${attackCount} attacks`,
    });
  }
}

/** Optional fields are validated per effect ID (RESOLVED-34). */
function checkOptionalFields(effect: EffectFieldsInput, ctx: z.RefinementCtx): void {
  const isStatPct = effect.id === "passive.stat_pct";
  if (isStatPct && effect.stat === undefined) {
    ctx.addIssue({ code: "custom", path: ["stat"], message: "passive.stat_pct needs a stat" });
  }
  if (!isStatPct && effect.stat !== undefined) {
    ctx.addIssue({ code: "custom", path: ["stat"], message: `not allowed on ${effect.id}` });
  }
  checkField(
    effect,
    ctx,
    "element",
    ["passive.stat_pct", "buff.elem_weak_dmg", "attack.element_target", "barrier"],
    ["attack.element_target"],
  );
  checkField(
    effect,
    ctx,
    "hpScaling",
    ["attack.hp_scaled", "passive.atk_hp_scaled"],
    ["attack.hp_scaled", "passive.atk_hp_scaled"],
  );
  checkField(effect, ctx, "flatAtk", [...ATTACK_SHAPE_IDS, "debuff.dot"]);
  checkField(effect, ctx, "bcDrop", ATTACK_SHAPE_IDS);
  checkField(effect, ctx, "critRate", ATTACK_SHAPE_IDS);
  checkField(effect, ctx, "ailment", ["buff.add_ailment"], ["buff.add_ailment"]);
  if (effect.id === "buff.add_ailment" && !(effect.value > 0 && effect.value <= 100)) {
    ctx.addIssue({ code: "custom", path: ["value"], message: "chance must be in (0, 100]" });
  }
  checkField(effect, ctx, "damageBonus", ["hits.add_normal"]);
  const thresholdIds = [
    "bb.fill_on_damage_taken",
    "mitigation_after_damage",
    "bb.fill_on_damage_dealt",
  ] as const;
  checkField(effect, ctx, "threshold", thresholdIds, thresholdIds);
  checkSurvivalFields(effect, ctx);
  checkAttackEffect(effect, ctx);
  const isCond = effect.id.startsWith("cond.");
  if (isCond && effect.effects === undefined) {
    ctx.addIssue({ code: "custom", path: ["effects"], message: `${effect.id} needs effects` });
  }
  if (!isCond && effect.effects !== undefined) {
    ctx.addIssue({ code: "custom", path: ["effects"], message: `not allowed on ${effect.id}` });
  }
}

/** An effect gated by a `cond.*` effect; it cannot itself be a condition. */
export const ConditionedEffectSchema = z.strictObject(effectFields).superRefine((effect, ctx) => {
  if (effect.id.startsWith("cond.")) {
    ctx.addIssue({ code: "custom", path: ["id"], message: "conditions cannot be nested" });
  }
  checkOptionalFields(effect, ctx);
});
export type ConditionedEffect = z.infer<typeof ConditionedEffectSchema>;

/**
 * One effect: `{ id, value, turns, target }` (GAME_DESIGN §4 → Effect shape), plus optional
 * per-ID fields (RESOLVED-34): `stat`/`element` on `passive.stat_pct`, `element` on
 * `attack.element_target` and `buff.elem_weak_dmg`, `hpScaling` on `attack.hp_scaled` and
 * `passive.atk_hp_scaled`, `flatAtk`, `bcDrop`, and `critRate` on attack shapes, `flatAtk` on `debuff.dot`, `ailment` on `buff.add_ailment`, `damageBonus` on `hits.add_normal`,
 * `min`/`max`/`recBonus`/`chance` on survival effects, `min`/`max` on `bb.fill_on_spark`, `bb.fill_on_hit`, `bb.consumption_reduction`, and `hp_drain`, `chance` on `debuff.atk_down`/`def_down`/`spark_vuln`/`hp_drain` (optional) and `buff.spark_crit`/`damage_reflect` (required), `element` on `barrier`, `threshold` on
 * `bb.fill_on_damage_taken`, `mitigation_after_damage`, and `bb.fill_on_damage_dealt`, and the gated `effects` of a `cond.*` effect. `turns` is omitted for instant or permanent (passive) effects.
 */
export const EffectSchema = z
  .strictObject({
    ...effectFields,
    /** `cond.*` only (required there): the effects active while the condition holds. */
    effects: z.array(ConditionedEffectSchema).min(1).optional(),
  })
  .superRefine(checkOptionalFields);
export type Effect = z.infer<typeof EffectSchema>;
