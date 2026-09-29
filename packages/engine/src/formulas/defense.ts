/**
 * DEF reduction (GAME_DESIGN §3 `def_term`): the target's total DEF ÷ 3, or 0 when the attacker
 * ignores DEF. Not rounded (RESOLVED-37 item 4); only the final hit is floored.
 */
export function defenseTerm(targetDefTotal: number, defIgnore = false): number {
  return defIgnore ? 0 : Math.max(0, targetDefTotal) / 3;
}
