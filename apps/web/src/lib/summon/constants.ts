// Client-safe summon constants: no content imports, so client components can use them.

/** Pull counts and gem prices accepted by the `summon` RPC (GAME_DESIGN §8 → Rare Summon). */
export const SUMMON_COSTS = { 1: 5, 11: 50 } as const;
export type SummonCount = keyof typeof SUMMON_COSTS;

/** The gate, burst, halo, and rarity word a pulled form plays (legacy/ART_GUIDE_BFR.md → Rarity treatments). */
export type SummonTreatment = "gold" | "red" | "rainbow";

export const RARITY_WORDS: Readonly<Record<SummonTreatment, string>> = {
  gold: "RARE!!",
  red: "SUPER RARE!!",
  rainbow: "MEGA RARE!!",
};

/** Why a summon cannot start, or null. Mirrors the RPC's checks for an early message. */
export function summonProblem(gems: number | null, count: SummonCount): string | null {
  if (gems === null) return "Your gems could not be loaded.";
  return gems < SUMMON_COSTS[count] ? "Not enough gems." : null;
}

/** The banner the free 10-pull ticket pulls on (GAME_DESIGN §8 Login rewards; `summon_ticket`). */
export const TICKET_BANNER_ID = "launch-summon";
/** Pulls one free ticket buys (10, no bonus pull). */
export const TICKET_PULLS = 10;

/** Whether the ticket option shows on `bannerId`: only while a ticket is held. */
export function ticketOffered(bannerId: string, tickets: number | null): boolean {
  return bannerId === TICKET_BANNER_ID && tickets !== null && tickets > 0;
}
