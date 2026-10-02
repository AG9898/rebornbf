/**
 * The wave transition (RESOLVED-91, M2-07F): the timed beats the battle scene plays between a
 * non-final wave clear (or a turn-triggered form change) and the next wave's enemies entering.
 * Pure presentation timing: the engine has already cleared the wave and spawned the next one; the
 * scene only delays showing it and holds every input until the last beat ends.
 */

/** One beat of the sequence, in play order. */
export type TransitionBeat =
  | "win"
  | "drops"
  | "wipe-out"
  | "panel"
  | "wipe-in"
  | "party-alone"
  | "boss"
  | "enter";

/**
 * Beat lengths at x1 (ms). RESOLVED-91 sets wipe out 0.35 s, panel 1.2 s, wipe in 0.35 s, party
 * alone 1.0 s, and enemy entry 0.5 s. "WIN!!" and the boss banner hold for one banner slide each
 * (the boss banner reuses the battle-start banner's 1.1 s beat). `drops` has no fixed length: it
 * lasts until the pending crystal fly-ins land.
 */
export const BEAT_MS = {
  win: 900,
  "wipe-out": 350,
  panel: 1200,
  "wipe-in": 350,
  "party-alone": 1000,
  boss: 1100,
  enter: 500,
} as const satisfies Record<Exclude<TransitionBeat, "drops">, number>;

/** What starts a transition, and what the next wave needs. */
export interface TransitionSpec {
  /** `clear` after `WaveCleared`; `form-change` after `FormChanged` (nothing was won: no WIN!!). */
  readonly kind: "clear" | "form-change";
  /** 0-based wave just cleared (or changing form). */
  readonly fromWave: number;
  readonly waveCount: number;
  /** The next wave holds a stage boss: the boss banner plays over the empty field. */
  readonly boss: boolean;
  /** x1 ms until the pending drop fly-ins land, counted from the transition start. */
  readonly dropsMs: number;
}

export interface TransitionStep {
  readonly beat: TransitionBeat;
  /** Length at x1 (ms); x2 playback runs two x1 steps per frame, so it lasts half as long. */
  readonly ms: number;
}

/**
 * The beats for `spec`, in order. Drops run only past the WIN!! beat (fly-ins overlap it) and are
 * left out when nothing is still flying; a form change has neither; a boss wave adds the boss beat.
 */
export function transitionBeats(spec: TransitionSpec): TransitionStep[] {
  const steps: TransitionStep[] = [];
  if (spec.kind === "clear") {
    steps.push({ beat: "win", ms: BEAT_MS.win });
    const drops = Math.max(0, Math.ceil(spec.dropsMs - BEAT_MS.win));
    if (drops > 0) steps.push({ beat: "drops", ms: drops });
  }
  steps.push(
    { beat: "wipe-out", ms: BEAT_MS["wipe-out"] },
    { beat: "panel", ms: BEAT_MS.panel },
    { beat: "wipe-in", ms: BEAT_MS["wipe-in"] },
    { beat: "party-alone", ms: BEAT_MS["party-alone"] },
  );
  if (spec.boss) steps.push({ beat: "boss", ms: BEAT_MS.boss });
  steps.push({ beat: "enter", ms: BEAT_MS.enter });
  return steps;
}

/** A running transition: its beats and the x1 time played so far. */
export interface WaveTransition {
  readonly spec: TransitionSpec;
  readonly steps: readonly TransitionStep[];
  readonly elapsedMs: number;
}

export function startTransition(spec: TransitionSpec): WaveTransition {
  return { spec, steps: transitionBeats(spec), elapsedMs: 0 };
}

/** Plays `ms` of x1 time (one `playbackSteps` step). */
export function advanceTransition(transition: WaveTransition, ms: number): WaveTransition {
  return { ...transition, elapsedMs: transition.elapsedMs + Math.max(0, ms) };
}

/** Total x1 length of the sequence. */
export function transitionMs(transition: Pick<WaveTransition, "steps">): number {
  return transition.steps.reduce((total, step) => total + step.ms, 0);
}

/** Wall-clock length at a playback speed: x2 halves every beat. */
export function transitionWallMs(transition: Pick<WaveTransition, "steps">, speed: 1 | 2): number {
  return transitionMs(transition) / speed;
}

/** Where a transition is: its beat (with its index in `steps`) and progress through it, 0..1. */
export interface TransitionFrame {
  readonly beat: TransitionBeat;
  readonly index: number;
  readonly progress: number;
}

/** The current beat, or undefined once every beat has played. */
export function transitionFrame(transition: WaveTransition): TransitionFrame | undefined {
  let start = 0;
  for (const [index, step] of transition.steps.entries()) {
    if (transition.elapsedMs < start + step.ms) {
      return { beat: step.beat, index, progress: (transition.elapsedMs - start) / step.ms };
    }
    start += step.ms;
  }
  return undefined;
}

export function isTransitionDone(transition: WaveTransition): boolean {
  return transitionFrame(transition) === undefined;
}

/**
 * Inputs (auto and player: attack, burst, guard, items, target taps) are held from the clear until
 * the enemies have entered. The Auto and Speed pills are not inputs and always toggle.
 */
export function holdsInput(transition: WaveTransition | undefined): boolean {
  return transition !== undefined && !isTransitionDone(transition);
}

/** When during the panel beat its "BATTLE n/N" label steps to the next wave. */
export const PANEL_STEP_AT = 0.5;

/** The panel's label: the cleared wave until `PANEL_STEP_AT`, then the next one (1-based). */
export function panelLabel(
  spec: Pick<TransitionSpec, "fromWave" | "waveCount">,
  progress: number,
): string {
  const wave = progress < PANEL_STEP_AT ? spec.fromWave : spec.fromWave + 1;
  return `BATTLE ${wave + 1}/${Math.max(spec.waveCount, wave + 1)}`;
}

/** The marker's slide through the panel beat: it rests, slides fast, then rests (reference 4 fps). */
export const PANEL_SLIDE = { from: 0.2, to: 0.55 } as const;

/**
 * The marker's place on the panel track, 0 at the start emblem (right) to 1 at the boss emblem
 * (left): wave n of N sits at (n - 1)/(N - 1). It slides from the cleared wave's place to the next
 * wave's across `PANEL_SLIDE`, and the label steps (`PANEL_STEP_AT`) late in the slide. With
 * reduced motion it jumps when the label steps.
 */
export function panelMarker(
  spec: Pick<TransitionSpec, "fromWave" | "waveCount">,
  progress: number,
  motion = true,
): number {
  const last = Math.max(1, spec.waveCount - 1);
  const from = Math.min(1, spec.fromWave / last);
  const to = Math.min(1, (spec.fromWave + 1) / last);
  if (!motion) return progress < PANEL_STEP_AT ? from : to;
  const span = PANEL_SLIDE.to - PANEL_SLIDE.from;
  const t = Math.min(1, Math.max(0, (progress - PANEL_SLIDE.from) / span));
  const eased = t * t * (3 - 2 * t);
  return from + (to - from) * eased;
}

/**
 * The panel track on the 640-wide grid (logical px), measured from the reference frames: the
 * trough spans `left`..`right` at `y`; the marker travels between `startX` (wave 1, right, under
 * the start emblem) and `bossX` (the last wave, left, under the boss emblem).
 */
export const PANEL_TRACK = {
  left: 118,
  right: 522,
  y: 368,
  height: 18,
  bossX: 134,
  startX: 506,
} as const;

/** The marker's x for a `panelMarker` place (0 start .. 1 boss). */
export function panelMarkerX(place: number): number {
  const clamped = Math.min(1, Math.max(0, place));
  return PANEL_TRACK.startX - (PANEL_TRACK.startX - PANEL_TRACK.bossX) * clamped;
}

/** The track fill behind the marker: from the marker to the start end (empty at wave 1). */
export function panelFill(place: number): { readonly x: number; readonly width: number } {
  const x = panelMarkerX(place);
  return { x, width: Math.max(0, PANEL_TRACK.startX - x) };
}
