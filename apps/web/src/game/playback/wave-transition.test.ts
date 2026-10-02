import { describe, expect, it } from "vitest";
import { playbackSteps } from "../hud/controls.ts";
import {
  advanceTransition,
  BEAT_MS,
  holdsInput,
  isTransitionDone,
  PANEL_SLIDE,
  PANEL_STEP_AT,
  PANEL_TRACK,
  panelFill,
  panelLabel,
  panelMarker,
  panelMarkerX,
  startTransition,
  type TransitionSpec,
  transitionBeats,
  transitionFrame,
  transitionMs,
  transitionWallMs,
  type WaveTransition,
} from "./wave-transition.ts";

const CLEAR: TransitionSpec = { kind: "clear", fromWave: 0, waveCount: 3, boss: false, dropsMs: 0 };
const FRAME_MS = 1000 / 60;

/** Plays a transition frame by frame like the battle scene; returns frames and beats seen. */
function play(transition: WaveTransition, speed: 1 | 2) {
  let t = transition;
  let frames = 0;
  const beats: string[] = [];
  while (!isTransitionDone(t)) {
    for (const ms of playbackSteps(FRAME_MS, speed)) t = advanceTransition(t, ms);
    frames += 1;
    const beat = transitionFrame(t)?.beat;
    if (beat && beats.at(-1) !== beat) beats.push(beat);
  }
  return { frames, beats };
}

describe("wave transition (RESOLVED-91)", () => {
  it("plays a wave clear in the original's order with the decided beats", () => {
    expect(transitionBeats(CLEAR)).toEqual([
      { beat: "win", ms: BEAT_MS.win },
      { beat: "wipe-out", ms: 350 },
      { beat: "panel", ms: 1200 },
      { beat: "wipe-in", ms: 350 },
      { beat: "party-alone", ms: 1000 },
      { beat: "enter", ms: 500 },
    ]);
  });

  it("waits for drop fly-ins still landing after WIN!!", () => {
    expect(transitionBeats({ ...CLEAR, dropsMs: BEAT_MS.win + 300 })[1]).toEqual({
      beat: "drops",
      ms: 300,
    });
    // Fly-ins that land during WIN!! add no drops beat.
    expect(transitionBeats({ ...CLEAR, dropsMs: 500 }).map((s) => s.beat)).not.toContain("drops");
  });

  it("adds the boss banner over the empty field before a boss wave's enemies enter", () => {
    const beats = transitionBeats({ ...CLEAR, fromWave: 1, boss: true }).map((s) => s.beat);
    expect(beats.slice(-3)).toEqual(["party-alone", "boss", "enter"]);
    expect(transitionBeats({ ...CLEAR, boss: true }).find((s) => s.beat === "boss")?.ms).toBe(1100);
  });

  it("plays a form change as a wave change without WIN!! or drops", () => {
    const beats = transitionBeats({ ...CLEAR, kind: "form-change", dropsMs: 2000 });
    expect(beats.map((s) => s.beat)).toEqual([
      "wipe-out",
      "panel",
      "wipe-in",
      "party-alone",
      "enter",
    ]);
  });

  it("reports the current beat and its progress, then finishes", () => {
    const t = startTransition(CLEAR);
    expect(transitionFrame(t)).toEqual({ beat: "win", index: 0, progress: 0 });
    const mid = advanceTransition(t, BEAT_MS.win + 350 + 600);
    expect(transitionFrame(mid)).toEqual({ beat: "panel", index: 2, progress: 0.5 });
    const end = advanceTransition(t, transitionMs(t));
    expect(transitionFrame(end)).toBeUndefined();
    expect(isTransitionDone(end)).toBe(true);
  });

  it("holds input from the clear until the enemies have entered", () => {
    const t = startTransition(CLEAR);
    expect(holdsInput(undefined)).toBe(false);
    expect(holdsInput(t)).toBe(true);
    const total = transitionMs(t);
    expect(holdsInput(advanceTransition(t, total - 1))).toBe(true);
    expect(transitionFrame(advanceTransition(t, total - 1))?.beat).toBe("enter");
    expect(holdsInput(advanceTransition(t, total))).toBe(false);
  });

  it("halves every beat at x2 through the scene's playback steps", () => {
    const t = startTransition({ ...CLEAR, boss: true });
    expect(transitionWallMs(t, 2)).toBe(transitionWallMs(t, 1) / 2);
    const x1 = play(t, 1);
    const x2 = play(t, 2);
    expect(x2.beats).toEqual(x1.beats);
    expect(x1.beats).toEqual(t.steps.map((s) => s.beat));
    expect(Math.abs(x2.frames - x1.frames / 2)).toBeLessThanOrEqual(1);
    expect(x1.frames).toBe(Math.ceil(transitionMs(t) / FRAME_MS));
  });

  it("steps the panel's BATTLE n/N and slides its marker toward the boss end", () => {
    const spec = { fromWave: 0, waveCount: 3 };
    expect(panelLabel(spec, 0)).toBe("BATTLE 1/3");
    expect(panelLabel(spec, 0.49)).toBe("BATTLE 1/3");
    expect(panelLabel(spec, 0.5)).toBe("BATTLE 2/3");
    expect(panelLabel({ fromWave: 9, waveCount: 11 }, 1)).toBe("BATTLE 11/11");
    expect(panelMarker(spec, 0)).toBe(0);
    expect(panelMarker(spec, 1)).toBe(0.5);
    expect(panelMarker({ fromWave: 1, waveCount: 3 }, 1)).toBe(1);
    expect(panelMarker(spec, 0.5)).toBeGreaterThan(0);
    expect(panelMarker(spec, 0.5)).toBeLessThan(0.5);
  });

  it("rests the marker before and after its slide", () => {
    const spec = { fromWave: 1, waveCount: 4 };
    expect(panelMarker(spec, PANEL_SLIDE.from)).toBeCloseTo(1 / 3);
    expect(panelMarker(spec, PANEL_SLIDE.to)).toBeCloseTo(2 / 3);
    expect(panelMarker(spec, 0.9)).toBeCloseTo(2 / 3);
    // The label steps while the marker is still moving.
    expect(PANEL_STEP_AT).toBeGreaterThan(PANEL_SLIDE.from);
    expect(PANEL_STEP_AT).toBeLessThan(PANEL_SLIDE.to);
    const mid = panelMarker(spec, PANEL_STEP_AT);
    expect(mid).toBeGreaterThan(1 / 3);
    expect(mid).toBeLessThan(2 / 3);
  });

  it("jumps the marker with the label under reduced motion", () => {
    const spec = { fromWave: 0, waveCount: 3 };
    expect(panelMarker(spec, PANEL_STEP_AT - 0.01, false)).toBe(0);
    expect(panelMarker(spec, PANEL_STEP_AT, false)).toBe(0.5);
  });

  it("places the marker and fill on the track from start (right) to boss (left)", () => {
    expect(panelMarkerX(0)).toBe(PANEL_TRACK.startX);
    expect(panelMarkerX(1)).toBe(PANEL_TRACK.bossX);
    expect(panelMarkerX(0.5)).toBe((PANEL_TRACK.startX + PANEL_TRACK.bossX) / 2);
    expect(panelMarkerX(2)).toBe(PANEL_TRACK.bossX);
    expect(panelFill(0)).toEqual({ x: PANEL_TRACK.startX, width: 0 });
    expect(panelFill(1)).toEqual({
      x: PANEL_TRACK.bossX,
      width: PANEL_TRACK.startX - PANEL_TRACK.bossX,
    });
    // Both ends of the marker's travel stay inside the trough.
    expect(PANEL_TRACK.bossX).toBeGreaterThan(PANEL_TRACK.left);
    expect(PANEL_TRACK.startX).toBeLessThan(PANEL_TRACK.right);
  });
});
