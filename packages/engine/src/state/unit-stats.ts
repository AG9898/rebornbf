import { type Form, ImpStatsSchema, type Stats } from "@bfr/data";

// Stat growth and unit types (GAME_DESIGN §6 → Stat growth and unit types, RESOLVED-56). BFR
// rules, not verified original values. The type and its per-level gains are rolled once by the
// server at acquisition and persisted; the engine only consumes them, so a replay never re-rolls.

/** A unit's type. Rex is valid (its ranges are recorded) but never rolled at launch. */
export type UnitType = "lord" | "anima" | "breaker" | "guardian" | "oracle" | "rex";

export const UNIT_TYPES: readonly UnitType[] = [
  "lord",
  "anima",
  "breaker",
  "guardian",
  "oracle",
  "rex",
];

/** Signed integer stat change per level above 1, as persisted on the owned unit. */
export type TypeGains = Stats;

/** The persisted type roll of one owned unit. */
export interface UnitTypeRoll {
  readonly type: UnitType;
  readonly gains: TypeGains;
}

type StatKey = keyof Stats;
type Range = readonly [min: number, max: number];

/**
 * Inclusive per-level gain ranges by type (GAME_DESIGN §6 table); losses are negative. A stat the
 * type does not change has the range [0, 0].
 */
export const TYPE_GAIN_RANGES: Readonly<Record<UnitType, Readonly<Record<StatKey, Range>>>> = {
  lord: { hp: [0, 0], atk: [0, 0], def: [0, 0], rec: [0, 0] },
  anima: { hp: [5, 10], atk: [0, 0], def: [0, 0], rec: [-3, -1] },
  breaker: { hp: [0, 0], atk: [1, 3], def: [-3, -1], rec: [0, 0] },
  guardian: { hp: [0, 0], atk: [0, 0], def: [1, 3], rec: [-2, 0] },
  oracle: { hp: [0, 0], atk: [0, 0], def: [-2, 0], rec: [2, 4] },
  rex: { hp: [10, 15], atk: [1, 2], def: [1, 2], rec: [1, 2] },
};

const STAT_KEYS: readonly StatKey[] = ["hp", "atk", "def", "rec"];

export const ZERO_IMPS: Stats = { hp: 0, atk: 0, def: 0, rec: 0 };

/** Snapshot totals must be nonnegative integers within the current form's caps. */
export function impStatsProblem(form: Form, imps: Stats): string | undefined {
  if (!ImpStatsSchema.safeParse(imps).success) return "must be nonnegative integer stat totals";
  for (const key of STAT_KEYS) {
    if (imps[key] > (form.impCaps?.[key] ?? 0)) return `${key}: exceeds the form's imp cap`;
  }
  return undefined;
}

/** A Lord roll: no gains. Fodder, summon filler, and any unit without a persisted roll use it. */
export const LORD_ROLL: UnitTypeRoll = { type: "lord", gains: { hp: 0, atk: 0, def: 0, rec: 0 } };

/**
 * Returns a problem with a persisted type roll (unknown type, non-integer gain, or a gain outside
 * the type's range), or `undefined` when it is valid. The message names the offending field.
 */
export function typeRollProblem(roll: UnitTypeRoll): string | undefined {
  const ranges = UNIT_TYPES.includes(roll.type) ? TYPE_GAIN_RANGES[roll.type] : undefined;
  if (!ranges) return `type: unknown unit type "${String(roll.type)}"`;
  for (const key of STAT_KEYS) {
    const gain = roll.gains[key];
    const [min, max] = ranges[key];
    if (!Number.isInteger(gain) || gain < min || gain > max) {
      return `gains.${key}: ${roll.type} gains must be integers ${min}…${max} (got ${gain})`;
    }
  }
  return undefined;
}

/**
 * The Lord curve at `level`: `base + floor((max − base) × (L − 1) / (M − 1))`, so level 1 is
 * `stats.base` and level M is `stats.max`; a form with M = 1 is always `stats.base`.
 */
export function lordStatsAtLevel(form: Form, level: number): Stats {
  const { base, max } = form.stats;
  const span = form.maxLevel - 1;
  if (span === 0) return { ...base };
  const at = (key: StatKey): number =>
    base[key] + Math.floor(((max[key] - base[key]) * (level - 1)) / span);
  return { hp: at("hp"), atk: at("atk"), def: at("def"), rec: at("rec") };
}

/**
 * A form's HP/ATK/DEF/REC at `level` with a persisted type roll and imp totals (before passives).
 * Pre-Omni: `max(1, lord(L) + gain × (L − 1))` per stat. Omni forms have fixed stats (RESOLVED-18)
 * and use `lord(L)` only. Imps add flat gains afterwards, including on Omni. `level` must be an
 * integer 1…`form.maxLevel`.
 */
export function formStatsAtLevel(
  form: Form,
  level: number,
  roll: UnitTypeRoll = LORD_ROLL,
  imps: Stats = ZERO_IMPS,
): Stats {
  const problem = impStatsProblem(form, imps);
  if (problem) throw new RangeError(`imps: ${problem}`);
  const lord = lordStatsAtLevel(form, level);
  const at = (key: StatKey): number =>
    Math.max(1, lord[key] + (form.rarity === "omni" ? 0 : roll.gains[key] * (level - 1))) +
    imps[key];
  return { hp: at("hp"), atk: at("atk"), def: at("def"), rec: at("rec") };
}
