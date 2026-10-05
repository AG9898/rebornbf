import type { Banner } from "./cues.ts";

/**
 * The trial squad swap (M6-01L; GAME_DESIGN §7 → Trials flow and three squads, RESOLVED-95/97):
 * the timed beats the battle scene plays when the engine's `SquadEntered` replaces a wiped party.
 * Pure presentation timing: the engine has already swapped the party; the scene shows the wiped
 * party leaving, a "Squad n" banner, and the next party entering like a wave start, and holds
 * every input (auto and player) until the entrance lands, as the wave transition does.
 */

/** One beat of the swap, in play order. */
export type SquadSwapBeat = "leave" | "banner" | "enter";

/**
 * Beat lengths at x1 (ms). The leave and enter beats match the wave transition's enemy entry
 * (0.5 s, RESOLVED-91); the banner holds for one banner slide, like the boss banner (1.1 s).
 */
export const SQUAD_SWAP_MS = {
  leave: 500,
  banner: 1100,
  enter: 500,
} as const satisfies Record<SquadSwapBeat, number>;

export const SQUAD_SWAP_BEATS: readonly SquadSwapBeat[] = ["leave", "banner", "enter"];

/** A running swap: the entering squad (0-based, as `SquadEntered.squad`) and x1 time played. */
export interface SquadSwap {
  readonly squad: number;
  readonly elapsedMs: number;
}

export function startSquadSwap(squad: number): SquadSwap {
  return { squad, elapsedMs: 0 };
}

/** Plays `ms` of x1 time (one `playbackSteps` step; x2 runs two per frame). */
export function advanceSquadSwap(swap: SquadSwap, ms: number): SquadSwap {
  return { ...swap, elapsedMs: swap.elapsedMs + Math.max(0, ms) };
}

/** Total x1 length of the swap. */
export const SQUAD_SWAP_TOTAL_MS = SQUAD_SWAP_BEATS.reduce(
  (total, beat) => total + SQUAD_SWAP_MS[beat],
  0,
);

/** Where a swap is: its beat (with its index in play order) and progress through it, 0..1. */
export interface SquadSwapFrame {
  readonly beat: SquadSwapBeat;
  readonly index: number;
  readonly progress: number;
}

/** The current beat, or undefined once every beat has played. */
export function squadSwapFrame(swap: SquadSwap): SquadSwapFrame | undefined {
  let start = 0;
  for (const [index, beat] of SQUAD_SWAP_BEATS.entries()) {
    const ms = SQUAD_SWAP_MS[beat];
    if (swap.elapsedMs < start + ms) {
      return { beat, index, progress: (swap.elapsedMs - start) / ms };
    }
    start += ms;
  }
  return undefined;
}

/** Inputs are held from the wipe until the new squad has entered. */
export function swapHoldsInput(swap: SquadSwap | undefined): boolean {
  return swap !== undefined && squadSwapFrame(swap) !== undefined;
}

/** The banner for 0-based `squad`: "Squad 2" or "Squad 3" on the wave banner plate. */
export function squadBanner(squad: number): Banner {
  return { piece: "banner-wave", title: `Squad ${squad + 1}` };
}

/**
 * A party sprite's place during the swap: the wiped party fades from its downed alpha and (with
 * motion) slides right, off toward the screen edge; the next party slides in from the right and
 * fades in. `offsetX` is in logical px from its rest x.
 */
export function squadSwapPlacement(
  beat: SquadSwapBeat,
  progress: number,
  motion: boolean,
  downedAlpha = 0.2,
): { readonly alpha: number; readonly offsetX: number; readonly visible: boolean } {
  const p = Math.min(1, Math.max(0, progress));
  switch (beat) {
    case "leave":
      return {
        alpha: downedAlpha * (1 - p),
        offsetX: motion ? SWAP_SLIDE_PX * p : 0,
        visible: true,
      };
    case "banner":
      return { alpha: 0, offsetX: 0, visible: false };
    case "enter":
      return { alpha: p, offsetX: motion ? SWAP_SLIDE_PX * (1 - p) : 0, visible: true };
  }
}

/** How far (logical px) a leaving or entering party slides. */
export const SWAP_SLIDE_PX = 60;
