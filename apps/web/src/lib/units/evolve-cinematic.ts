import type { Rarity } from "@bfr/data";

/**
 * Client-safe helpers for the evolve cinematic (M4-06M; ART_GUIDE → UI → Evolve cinematic). No
 * content imports, so the client sequence can use them.
 */

/** The cinematic's halo and letter colour, from the new form's rarity. */
export type EvolveTheme = "gold" | "red" | "rainbow";

function rarityNumber(rarity: Rarity): number {
  return rarity === "omni" ? 8 : rarity;
}

/** The rarity word that drops in on the reveal: 3★ and below RARE, 4★ SUPER RARE, 5★+ MEGA RARE. */
export function evolveRarityWord(rarity: Rarity): string {
  const r = rarityNumber(rarity);
  return r >= 5 ? "MEGA RARE" : r === 4 ? "SUPER RARE" : "RARE";
}

/** The halo and letter theme: 4★ and below gold, 5★ red, 6★ and above (Omni included) rainbow. */
export function evolveTheme(rarity: Rarity): EvolveTheme {
  const r = rarityNumber(rarity);
  return r >= 6 ? "rainbow" : r === 5 ? "red" : "gold";
}

/** Timed steps of the full sequence, in order, with how long each holds (ms). */
export const EVOLVE_STEPS = [
  { step: "pedestals", ms: 700 },
  { step: "circles", ms: 900 },
  { step: "join", ms: 800 },
  { step: "pillars", ms: 1300 },
  { step: "beam", ms: 550 },
  { step: "starburst", ms: 650 },
  { step: "flash", ms: 350 },
] as const;

/** The reduced-motion version: one short fade, then the reveal without moving letters. */
export const EVOLVE_REDUCED_FADE_MS = 450;

export type EvolveStep = (typeof EVOLVE_STEPS)[number]["step"] | "fade" | "reveal";

/** The step after `step` (the reveal waits for a tap, so it has none). */
export function nextEvolveStep(step: EvolveStep): EvolveStep | null {
  if (step === "reveal") return null;
  if (step === "fade") return "reveal";
  const index = EVOLVE_STEPS.findIndex((s) => s.step === step);
  return EVOLVE_STEPS[index + 1]?.step ?? "reveal";
}

/** How long `step` holds before moving on, or null for the reveal. */
export function evolveStepMs(step: EvolveStep): number | null {
  if (step === "reveal") return null;
  if (step === "fade") return EVOLVE_REDUCED_FADE_MS;
  return EVOLVE_STEPS.find((s) => s.step === step)?.ms ?? null;
}

/** The first step: the full sequence's pedestals, or the short fade under reduced motion. */
export function firstEvolveStep(reduced: boolean): EvolveStep {
  return reduced ? "fade" : EVOLVE_STEPS[0].step;
}
