import { FUSION_OUTCOMES, type FusionOutcome, type Stats } from "@bfr/data";
import { type OwnedUnitRow, type OwnedUnitView, toUnitDetailView } from "./owned-units.ts";

/** The fields of `fuse`'s jsonb result the result screen needs (M4-06C, M4-06E). */
export type FuseResponse = {
  outcome: FusionOutcome;
  expGained: number;
  exp: number;
  level: number;
  bbLevel: number;
  sbbLevel: number | null;
};

const isInt = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value);

/** Reads `fuse`'s result object; null when a field the result screen needs is missing or malformed. */
export function parseFuseResponse(data: unknown): FuseResponse | null {
  if (typeof data !== "object" || data === null) return null;
  const r = data as Record<string, unknown>;
  if (typeof r.outcome !== "string" || !Object.hasOwn(FUSION_OUTCOMES, r.outcome)) return null;
  if (!isInt(r.exp_gained) || !isInt(r.exp) || !isInt(r.level) || !isInt(r.bb_level)) return null;
  if (r.sbb_level !== null && r.sbb_level !== undefined && !isInt(r.sbb_level)) return null;
  return {
    outcome: r.outcome as FusionOutcome,
    expGained: r.exp_gained,
    exp: r.exp,
    level: r.level,
    bbLevel: r.bb_level,
    sbbLevel: isInt(r.sbb_level) ? r.sbb_level : null,
  };
}

export type FusionResultRow = {
  label: string;
  before: string;
  after: string;
  /** Whether the value rose: the after value is drawn in blue. */
  rose: boolean;
};

/** The fusion result screen's content (ART_GUIDE → UI → Fusion result). */
export type FusionResultView = {
  name: string;
  element: OwnedUnitView["element"];
  sprite: string | null;
  quote: string | null;
  /** The table's left column (Lv., HP, BB Lv.) and right column (Atk, Def, Rec). */
  left: FusionResultRow[];
  right: FusionResultRow[];
  /** EXP still needed for the next level; null at the form's cap. */
  expToNext: number | null;
  /** Progress through the new level, 0–1 (1 at the cap). */
  expProgress: number;
  /** "Great Success! 1.5x XP" or "Super Success! 2x XP"; null for a plain Success. */
  successText: string | null;
  /** Whether the LEVEL UP!! banner shows. */
  levelUp: boolean;
};

const SUCCESS_TEXT: Readonly<Partial<Record<FusionOutcome, string>>> = {
  great: `${FUSION_OUTCOMES.great.label}! 1.5x XP`,
  super: `${FUSION_OUTCOMES.super.label}! 2x XP`,
};

function row(label: string, before: number | null, after: number | null): FusionResultRow {
  const show = (n: number | null) => (n === null ? "–" : n.toLocaleString("en-US"));
  return {
    label,
    before: show(before),
    after: show(after),
    rose: before !== null && after !== null && after > before,
  };
}

/**
 * The before ▶ after result of a fusion: `before` is the base row as the stage held it, the after
 * row is that row with `fuse`'s returned level, EXP and burst levels, and `imps` (the preview's
 * deterministic stat hob totals, which `fuse` does not return). Stats come from the same
 * `toUnitDetailView` the unit pages use, so the table matches the refreshed collection.
 */
export function fusionResultView(
  before: OwnedUnitRow,
  response: FuseResponse,
  imps: Stats | undefined = before.imps,
): FusionResultView {
  const after: OwnedUnitRow = {
    ...before,
    level: response.level,
    exp: response.exp,
    bb_level: response.bbLevel,
    ...(response.sbbLevel !== null ? { sbb_level: response.sbbLevel } : {}),
    ...(imps ? { imps } : {}),
  };
  const a = toUnitDetailView(before);
  const b = toUnitDetailView(after);
  const level = (v: typeof a) => (v.maxLevel ? `${v.level}/${v.maxLevel}` : String(v.level));
  return {
    name: b.name,
    element: b.element,
    sprite: b.sprite,
    quote: b.quote,
    left: [
      { label: "Lv.", before: level(a), after: level(b), rose: b.level > a.level },
      row("HP", a.currentStats?.hp ?? null, b.currentStats?.hp ?? null),
      row("BB Lv.", a.bbLevel, b.bbLevel),
    ],
    right: [
      row("Atk", a.currentStats?.atk ?? null, b.currentStats?.atk ?? null),
      row("Def", a.currentStats?.def ?? null, b.currentStats?.def ?? null),
      row("Rec", a.currentStats?.rec ?? null, b.currentStats?.rec ?? null),
    ],
    expToNext: b.expToNext,
    expProgress: b.expProgress,
    successText: SUCCESS_TEXT[response.outcome] ?? null,
    levelUp: b.level > a.level,
  };
}
