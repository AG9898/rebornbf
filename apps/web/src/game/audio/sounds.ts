import type { BurstTier } from "@bfr/engine";
import type { Cue, CueContext } from "../playback/cues.ts";

/**
 * Every sound effect legacy/ART_GUIDE_BFR.md → Audio names: tap/hit, spark, crit, burst start (per tier),
 * crystal pickup, unit death, UI confirm/cancel, and summon reveal.
 */
export const SFX_IDS = [
  "hit",
  "spark",
  "crit",
  "burst-bb",
  "burst-sbb",
  "burst-ubb",
  "crystal",
  "death",
  "ui-confirm",
  "ui-cancel",
  "summon-reveal",
] as const;
export type SfxId = (typeof SFX_IDS)[number];

/** The launch music themes (ART_GUIDE.md → Audio). */
export const MUSIC_IDS = ["menu", "battle", "boss"] as const;
export type MusicId = (typeof MUSIC_IDS)[number];

/** Music and SFX levels, each 0 (silent) to 1 (full). */
export interface AudioVolume {
  readonly music: number;
  readonly sfx: number;
}

/** The documented defaults a player without saved settings hears (M7-01). */
export const DEFAULT_VOLUME: AudioVolume = { music: 0.5, sfx: 0.7 };

function clampLevel(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

/** A volume with each level clamped to 0–1; a non-number level falls back to the default. */
export function clampVolume(volume: Partial<AudioVolume>): AudioVolume {
  return {
    music: clampLevel(volume.music ?? DEFAULT_VOLUME.music, DEFAULT_VOLUME.music),
    sfx: clampLevel(volume.sfx ?? DEFAULT_VOLUME.sfx, DEFAULT_VOLUME.sfx),
  };
}

export function burstSfx(tier: BurstTier): SfxId {
  return `burst-${tier}`;
}

/** The sound effects for one battle cue. Values come from the cue, which copied the engine event. */
export function cueSfx(cue: Cue): SfxId[] {
  switch (cue.kind) {
    case "damage":
      return [cue.style === "crit" || cue.style === "spark-crit" ? "crit" : "hit"];
    case "unit-damage":
      return [cue.critical ? "crit" : "hit"];
    case "spark":
      return ["spark"];
    case "cutin":
      return [burstSfx(cue.tier)];
    case "crystals":
      return cue.drops.length > 0 ? ["crystal"] : [];
    case "death":
    case "unit-death":
      return ["death"];
    case "rejected":
      return ["ui-cancel"];
    case "action":
    case "guard":
    case "overdrive":
    case "enemy-action":
    case "heal":
    case "unit-revive":
    case "wave":
    case "turn":
    case "result":
      return [];
  }
}

/** The battle theme for 0-based `wave`: the boss theme on a stage boss wave. */
export function battleMusic(wave: number, context: Pick<CueContext, "bossWaves">): MusicId {
  return context.bossWaves.includes(wave) ? "boss" : "battle";
}

/**
 * One tone of a placeholder sound: a frequency glide (Hz) over `ms` with a fast attack and linear
 * release. `noise` ignores the frequencies.
 */
export interface ToneSegment {
  readonly wave: "sine" | "square" | "triangle" | "noise";
  readonly from: number;
  readonly to: number;
  readonly ms: number;
  /** Peak level, 0–1. */
  readonly gain: number;
}

/**
 * Synthesised placeholders until real audio lands (audio is deferred to public launch, RESOLVED-44).
 * They are generated in the browser, so no audio file is committed.
 */
export const PLACEHOLDER_SFX: Readonly<Record<SfxId, readonly ToneSegment[]>> = {
  hit: [{ wave: "noise", from: 0, to: 0, ms: 60, gain: 0.35 }],
  spark: [
    { wave: "triangle", from: 1320, to: 1760, ms: 70, gain: 0.3 },
    { wave: "triangle", from: 1760, to: 2200, ms: 90, gain: 0.25 },
  ],
  crit: [
    { wave: "square", from: 440, to: 220, ms: 50, gain: 0.25 },
    { wave: "noise", from: 0, to: 0, ms: 90, gain: 0.35 },
  ],
  "burst-bb": [{ wave: "sine", from: 330, to: 660, ms: 260, gain: 0.4 }],
  "burst-sbb": [{ wave: "sine", from: 330, to: 990, ms: 340, gain: 0.45 }],
  "burst-ubb": [
    { wave: "square", from: 220, to: 440, ms: 200, gain: 0.25 },
    { wave: "sine", from: 440, to: 1320, ms: 380, gain: 0.45 },
  ],
  crystal: [{ wave: "sine", from: 1568, to: 2093, ms: 80, gain: 0.25 }],
  death: [{ wave: "triangle", from: 392, to: 98, ms: 300, gain: 0.35 }],
  "ui-confirm": [
    { wave: "sine", from: 784, to: 784, ms: 50, gain: 0.3 },
    { wave: "sine", from: 1046, to: 1046, ms: 80, gain: 0.3 },
  ],
  "ui-cancel": [{ wave: "sine", from: 523, to: 392, ms: 100, gain: 0.3 }],
  "summon-reveal": [
    { wave: "sine", from: 523, to: 523, ms: 120, gain: 0.3 },
    { wave: "sine", from: 659, to: 659, ms: 120, gain: 0.3 },
    { wave: "sine", from: 784, to: 784, ms: 120, gain: 0.3 },
    { wave: "triangle", from: 1046, to: 1046, ms: 360, gain: 0.35 },
  ],
};

/** A placeholder theme: one soft note per beat, looped. */
export interface PlaceholderTheme {
  readonly bpm: number;
  /** Note frequencies (Hz), one per beat. */
  readonly notes: readonly number[];
}

export const PLACEHOLDER_MUSIC: Readonly<Record<MusicId, PlaceholderTheme>> = {
  menu: { bpm: 84, notes: [262, 330, 392, 330, 294, 349, 440, 349] },
  battle: { bpm: 132, notes: [220, 220, 330, 294, 220, 220, 349, 330] },
  boss: { bpm: 144, notes: [147, 156, 147, 220, 147, 156, 208, 196] },
};

function oscillator(wave: ToneSegment["wave"], phase: number, random: () => number): number {
  const cycle = phase - Math.floor(phase);
  switch (wave) {
    case "sine":
      return Math.sin(2 * Math.PI * cycle);
    case "square":
      return cycle < 0.5 ? 1 : -1;
    case "triangle":
      return 1 - 4 * Math.abs(cycle - 0.5);
    case "noise":
      return random() * 2 - 1;
  }
}

/**
 * Renders tone segments, one after another, into mono samples at `sampleRate`. `random` feeds the
 * noise segments (a seeded generator in tests).
 */
export function renderTones(
  segments: readonly ToneSegment[],
  sampleRate: number,
  random: () => number = Math.random,
): Float32Array {
  const lengths = segments.map((s) => Math.max(1, Math.round((s.ms / 1000) * sampleRate)));
  const out = new Float32Array(lengths.reduce((a, b) => a + b, 0));
  const attack = Math.round(0.004 * sampleRate);
  let offset = 0;
  segments.forEach((segment, i) => {
    const length = lengths[i] ?? 0;
    let phase = 0;
    for (let n = 0; n < length; n++) {
      const t = n / length;
      const freq = segment.from + (segment.to - segment.from) * t;
      phase += freq / sampleRate;
      const envelope = Math.min(1, attack > 0 ? n / attack : 1) * (1 - t);
      out[offset + n] = oscillator(segment.wave, phase, random) * envelope * segment.gain;
    }
    offset += length;
  });
  return out;
}

/** Renders one loop of a placeholder theme (one note per beat, half-beat sustain). */
export function renderTheme(theme: PlaceholderTheme, sampleRate: number): Float32Array {
  const beatMs = 60_000 / theme.bpm;
  const segments: ToneSegment[] = theme.notes.flatMap((note) => [
    { wave: "triangle", from: note, to: note, ms: beatMs / 2, gain: 0.18 },
    { wave: "sine", from: 0, to: 0, ms: beatMs / 2, gain: 0 },
  ]);
  return renderTones(segments, sampleRate);
}
