/**
 * Level EXP curves (GAME_DESIGN §6 → Level EXP and fusion, RESOLVED-57). Each array is the EXP
 * needed to go from level `i + 1` to level `i + 2` ("To Next"), for levels 1…149. Levels 1–119
 * (base 10) and 1–100 (base 21) are transcribed from the wiki's Unit_Leveling:10 and :21 "To Next"
 * columns; the rest are the documented BFR extensions. The migration
 * `supabase/migrations/*_fuse.sql` holds the same values (checked by level-exp.test.ts).
 */

/** The EXP curves a unit line can use, named by the "Next Lv" value at level 1. */
export const EXP_CURVES = [10, 21] as const;
export type ExpCurve = (typeof EXP_CURVES)[number];

/** Highest level any curve reaches (Omni). */
export const MAX_CURVE_LEVEL = 150;

export const TO_NEXT_LEVEL: Readonly<Record<ExpCurve, readonly number[]>> = {
  10: [
    10, 48, 102, 169, 245, 331, 425, 527, 636, 751, 872, 1_001, 1_133, 1_272, 1_417, 1_565, 1_718,
    1_877, 2_041, 2_206, 2_380, 2_556, 2_737, 2_921, 3_109, 3_301, 3_497, 3_697, 3_902, 4_108,
    4_319, 4_532, 4_749, 4_972, 5_195, 5_423, 5_653, 5_887, 6_124, 6_364, 6_608, 6_854, 7_103,
    7_355, 7_610, 7_868, 8_129, 8_393, 8_660, 8_928, 9_200, 9_475, 9_752, 10_032, 10_315, 10_600,
    10_888, 11_178, 11_471, 11_766, 12_064, 12_364, 12_667, 12_972, 13_280, 13_590, 13_902, 14_217,
    14_534, 14_854, 15_175, 15_499, 15_826, 16_154, 16_485, 16_818, 17_153, 17_491, 17_830, 18_172,
    18_516, 18_862, 19_210, 19_561, 19_913, 20_268, 20_624, 20_983, 21_344, 21_706, 22_071, 22_438,
    22_807, 23_178, 23_551, 23_925, 24_302, 24_681, 25_062, 25_445, 25_830, 26_217, 26_606, 26_997,
    27_390, 27_785, 28_182, 28_581, 28_973, 29_375, 29_805, 30_210, 30_617, 31_026, 31_437, 31_850,
    32_265, 32_682, 33_101, 33_522, 33_945, 34_370, 34_797, 35_226, 35_657, 36_090, 36_525, 36_962,
    37_401, 37_842, 38_285, 38_730, 39_177, 39_626, 40_077, 40_530, 40_985, 41_442, 41_901, 42_362,
    42_825, 43_290, 43_757, 44_226, 44_697, 45_170, 45_645, 46_122, 46_601,
  ],
  21: [
    21, 96, 204, 337, 490, 662, 850, 1_054, 1_271, 1_503, 1_745, 2_001, 2_267, 2_544, 2_832, 3_129,
    3_438, 3_754, 4_081, 4_415, 4_759, 5_112, 5_472, 5_841, 6_218, 6_603, 6_995, 7_394, 7_801,
    8_215, 8_637, 9_065, 9_500, 9_942, 10_390, 10_845, 11_307, 11_774, 12_248, 12_729, 13_215,
    13_708, 14_206, 14_710, 15_220, 15_736, 16_258, 16_785, 17_318, 17_856, 18_400, 18_950, 19_504,
    20_064, 20_629, 21_200, 21_775, 22_356, 22_941, 23_532, 24_128, 24_729, 25_334, 25_945, 26_560,
    27_180, 27_805, 28_434, 29_068, 29_707, 30_351, 30_999, 31_651, 32_308, 32_970, 33_636, 34_307,
    34_981, 35_661, 36_344, 37_032, 37_724, 38_421, 39_121, 39_826, 40_535, 41_248, 41_966, 42_687,
    43_413, 44_142, 44_876, 45_614, 46_355, 47_101, 47_851, 48_604, 49_362, 50_126, 50_888, 51_715,
    52_542, 53_370, 54_197, 55_024, 55_852, 56_679, 57_506, 58_334, 59_161, 59_989, 60_816, 61_643,
    62_471, 63_298, 64_125, 64_953, 65_780, 66_608, 67_435, 68_262, 69_090, 69_917, 70_744, 71_572,
    72_399, 73_227, 74_054, 74_881, 75_709, 76_536, 77_363, 78_191, 79_018, 79_846, 80_673, 81_500,
    82_328, 83_155, 83_982, 84_810, 85_637, 86_465, 87_292, 88_119, 88_947, 89_774, 90_601, 91_456,
  ],
};

/** Cumulative EXP a unit on `curve` needs to reach `level` from level 1 with 0 EXP. */
export function totalExpForLevel(curve: ExpCurve, level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > MAX_CURVE_LEVEL) {
    throw new RangeError(`level must be an integer 1-${MAX_CURVE_LEVEL}, got ${level}`);
  }
  let total = 0;
  const steps = TO_NEXT_LEVEL[curve];
  for (let i = 0; i < level - 1; i++) total += steps[i] ?? 0;
  return total;
}

/** The level a unit on `curve` with cumulative `exp` in its form has, capped at `maxLevel`. */
export function levelForExp(curve: ExpCurve, exp: number, maxLevel: number): number {
  let level = 1;
  let total = 0;
  const steps = TO_NEXT_LEVEL[curve];
  while (level < maxLevel && level < MAX_CURVE_LEVEL) {
    total += steps[level - 1] ?? 0;
    if (total > exp) break;
    level++;
  }
  return level;
}
