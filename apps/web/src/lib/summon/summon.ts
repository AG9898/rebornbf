import { type Banner, BannerSchema, RATE_TOTAL_BP, type Rarity } from "@bfr/data";
import launchSummon from "@bfr/data/content/banners/launch-summon.json";
import { formArtFile, rarityLabel, unitContent } from "../units/owned-units.ts";
import type { SummonCount, SummonTreatment } from "./constants.ts";
import { SUMMON_BANNER_ART, type SummonBannerArt } from "./summon-screen.ts";

export * from "./constants.ts";

export function isSummonCount(value: unknown): value is SummonCount {
  return value === 1 || value === 11;
}

/** The banners on the summon screen, in carousel order. Launch has one (M5-01B). */
export const SUMMON_BANNERS: readonly Banner[] = [BannerSchema.parse(launchSummon)];

/** Each banner's original banner and door art (M8-11; summon-screen.ts). */
export function bannerArt(bannerId: string): SummonBannerArt | null {
  return SUMMON_BANNER_ART[bannerId] ?? null;
}

export function summonBanner(bannerId: string): Banner | undefined {
  return SUMMON_BANNERS.find((b) => b.id === bannerId);
}

export function summonTreatment(rarity: Rarity | null): SummonTreatment {
  const r = rarity === "omni" ? 8 : (rarity ?? 0);
  return r >= 5 ? "rainbow" : r === 4 ? "red" : "gold";
}

/** `1.5%` from 150 bp; whole percents drop the decimals. */
export function formatRate(rateBp: number): string {
  const pct = (rateBp * 100) / RATE_TOTAL_BP;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2).replace(/0$/, "")}%`;
}

export type BannerRateRow = {
  unitId: string;
  name: string;
  rarityLabel: string;
  rate: string;
  featured: boolean;
};

/** Every summonable form with its rate, featured first (the rates disclosure). */
export function bannerRates(banner: Banner): BannerRateRow[] {
  const row = (entry: Banner["pool"][number], featured: boolean): BannerRateRow => {
    const unit = unitContent(entry.unit);
    const form = unit?.forms.find((f) => f.id === entry.form);
    return {
      unitId: entry.unit,
      name: unit?.name ?? entry.unit,
      rarityLabel: rarityLabel(form?.rarity ?? null),
      rate: formatRate(entry.rateBp),
      featured,
    };
  };
  return [...banner.featured.map((e) => row(e, true)), ...banner.pool.map((e) => row(e, false))];
}

/** Names of a banner's featured units, for its info text. */
export function featuredNames(banner: Banner): string[] {
  return banner.featured.map((e) => unitContent(e.unit)?.name ?? e.unit);
}

/** A banner as the client screen shows it: plain data, so content stays on the server. */
export type SummonBannerView = {
  id: string;
  name: string;
  art: SummonBannerArt | null;
  featured: string[];
  rates: BannerRateRow[];
  pityLimit: number;
};

export function summonBannerView(banner: Banner): SummonBannerView {
  return {
    id: banner.id,
    name: banner.name,
    art: bannerArt(banner.id),
    featured: featuredNames(banner),
    rates: bannerRates(banner),
    pityLimit: banner.pityPulls,
  };
}

/** One pull as the summon sequence shows it. */
export type SummonPullView = {
  index: number;
  unitId: string;
  formId: string;
  name: string;
  formName: string | null;
  rarityLabel: string;
  treatment: SummonTreatment;
  featured: boolean;
  sprite: string | null;
  thumb: string | null;
  /** The unit's page: its own row, or its stack for a stacked filler copy. */
  href: string | null;
};

export type SummonOutcome = {
  gems: number;
  pityAfter: number;
  pulls: SummonPullView[];
  /** Free 10-pull tickets left; only the ticket path (`summon_ticket`) reports it. */
  ticketsAfter: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function pullView(index: number, raw: unknown): SummonPullView | null {
  if (!isRecord(raw) || !isRecord(raw.unit) || typeof raw.featured !== "boolean") return null;
  const { unit_id: unitId, form_id: formId, owned_unit_id: rowId, stack_id: stackId } = raw.unit;
  if (typeof unitId !== "string" || typeof formId !== "string") return null;
  const unit = unitContent(unitId);
  const form = unit?.forms.find((f) => f.id === formId);
  const art = unit && form ? formArtFile(unitId, form.rarity) : null;
  return {
    index,
    unitId,
    formId,
    name: unit?.name ?? unitId,
    formName: form?.name ?? null,
    rarityLabel: rarityLabel(form?.rarity ?? null),
    treatment: summonTreatment(form?.rarity ?? null),
    featured: raw.featured,
    sprite: art ? `/assets/units/${unitId}/battle-idle-${art}.png` : null,
    thumb: art ? `/assets/ui/cards/thumb/${unitId}-${art}.webp` : null,
    href:
      typeof rowId === "string"
        ? `/units/${rowId}`
        : typeof stackId === "string"
          ? `/units/stack/${stackId}`
          : null,
  };
}

/**
 * Reads the `summon` RPC's payload (`{ batch_id, gems, pity_after, results[] }`), or
 * `summon_ticket`'s (the same plus `tickets_after`), or null.
 */
export function parseSummonResult(data: unknown): SummonOutcome | null {
  if (!isRecord(data) || !isCount(data.gems) || !isCount(data.pity_after)) return null;
  if (!Array.isArray(data.results) || data.results.length === 0) return null;
  const pulls = data.results.map((r, i) => pullView(i + 1, r));
  if (pulls.some((p) => p === null)) return null;
  const tickets = data.tickets_after;
  if (tickets !== undefined && !isCount(tickets)) return null;
  return {
    gems: data.gems,
    pityAfter: data.pity_after,
    pulls: pulls as SummonPullView[],
    ticketsAfter: isCount(tickets) ? tickets : null,
  };
}
