import type { Element } from "@bfr/data";
import { isOAuthProvider, type OAuthProvider } from "../supabase/routes.ts";
import { unitContent } from "../units/owned-units.ts";

/**
 * Display helpers for the sign-in and account screens (ART_GUIDE → Sign-in and Account screens).
 * Pure, so the pages stay thin and this is testable.
 */

/** The sign-in hero lineup: the six B0 starters at Omni, one per element, centre pair raised. */
export const SIGN_IN_HERO_IDS = ["garrick", "maren", "brand", "solen", "rook", "morrick"] as const;

export type SignInHero = {
  unitId: string;
  name: string;
  element: Element;
  /** Web path of the Omni showcase card (`/assets/ui/cards/<unit>-omni.webp`). */
  cardArt: string;
};

/** The sign-in screen's hero cards, in `SIGN_IN_HERO_IDS` order. */
export function signInHeroes(): SignInHero[] {
  return SIGN_IN_HERO_IDS.map((unitId) => {
    const unit = unitContent(unitId);
    if (!unit) throw new Error(`signInHeroes: ${unitId} has no unit content`);
    return {
      unitId,
      name: unit.name,
      element: unit.element,
      cardArt: `/assets/ui/cards/${unitId}-omni.webp`,
    };
  });
}

/**
 * The OAuth provider the session signed in with, from the JWT's `app_metadata.provider`; null
 * when it is missing or not one BFR offers.
 */
export function sessionProvider(
  claims: { app_metadata?: unknown } | null | undefined,
): OAuthProvider | null {
  const meta = claims?.app_metadata;
  if (!meta || typeof meta !== "object") return null;
  const provider: unknown = (meta as { provider?: unknown }).provider;
  return isOAuthProvider(provider) ? provider : null;
}

/** "Oct 6, 2026" for a timestamp (UTC, so server and client agree); null when unparseable. */
export function memberSinceLabel(timestamp: string | null | undefined): string | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** Every unit the player holds: one per `owned_units` row plus each stack's untouched copies. */
export function totalUnits(ownedRows: number, stackCounts: readonly number[]): number {
  return stackCounts.reduce((sum, count) => sum + Math.max(0, count), ownedRows);
}

/** Thousands separators for wallet and unit counts, e.g. 12,500. */
export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
