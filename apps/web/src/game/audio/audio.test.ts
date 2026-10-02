import { describe, expect, it } from "vitest";
import type { Cue } from "../playback/cues.ts";
import { AudioPlayer } from "./player.ts";
import {
  battleMusic,
  clampVolume,
  cueSfx,
  DEFAULT_VOLUME,
  MUSIC_IDS,
  PLACEHOLDER_MUSIC,
  PLACEHOLDER_SFX,
  renderTheme,
  renderTones,
  SFX_IDS,
  type SfxId,
} from "./sounds.ts";

const damage = (style: Extract<Cue, { kind: "damage" }>["style"]): Cue => ({
  kind: "damage",
  actor: "p0",
  target: "e0",
  amount: 10,
  style,
  targetHp: 5,
  hitIndex: 0,
  flashes: ["fx-hit"],
});

describe("battle SFX hooks", () => {
  it("maps battle cues to their effects", () => {
    expect(cueSfx(damage("normal"))).toEqual(["hit"]);
    expect(cueSfx(damage("spark"))).toEqual(["hit"]);
    expect(cueSfx(damage("crit"))).toEqual(["crit"]);
    expect(cueSfx(damage("spark-crit"))).toEqual(["crit"]);
    expect(
      cueSfx({
        kind: "unit-damage",
        target: "p1",
        amount: 3,
        critical: true,
        hitIndex: 0,
        flashes: [],
      }),
    ).toEqual(["crit"]);
    expect(cueSfx({ kind: "spark", target: "e0", hits: 2, critical: false })).toEqual(["spark"]);
    expect(cueSfx({ kind: "cutin", actor: "p0", tier: "bb" })).toEqual(["burst-bb"]);
    expect(cueSfx({ kind: "cutin", actor: "p0", tier: "sbb" })).toEqual(["burst-sbb"]);
    expect(cueSfx({ kind: "cutin", actor: "p0", tier: "ubb" })).toEqual(["burst-ubb"]);
    expect(
      cueSfx({
        kind: "crystals",
        collector: "p0",
        target: "e0",
        drops: [{ piece: "crystal-bc", count: 2 }],
      }),
    ).toEqual(["crystal"]);
    expect(cueSfx({ kind: "death", target: "e0" })).toEqual(["death"]);
    expect(cueSfx({ kind: "unit-death", target: "p0" })).toEqual(["death"]);
    expect(cueSfx({ kind: "turn", turn: 2 })).toEqual([]);
  });

  it("has a placeholder for every ART_GUIDE effect and theme", () => {
    expect(Object.keys(PLACEHOLDER_SFX).sort()).toEqual([...SFX_IDS].sort());
    expect(Object.keys(PLACEHOLDER_MUSIC).sort()).toEqual([...MUSIC_IDS].sort());
  });

  it("plays the boss theme on a boss wave", () => {
    expect(battleMusic(0, { bossWaves: [2] })).toBe("battle");
    expect(battleMusic(2, { bossWaves: [2] })).toBe("boss");
  });
});

describe("placeholder synthesis", () => {
  it("renders bounded samples of the summed segment length", () => {
    const samples = renderTones(PLACEHOLDER_SFX["summon-reveal"], 8000, () => 0.5);
    expect(samples.length).toBe(8000 * 0.72);
    expect(Math.max(...samples.map(Math.abs))).toBeLessThanOrEqual(1);
    expect(samples.some((v) => v !== 0)).toBe(true);
  });

  it("renders one theme loop of one beat per note", () => {
    const theme = PLACEHOLDER_MUSIC.menu;
    const beats = theme.notes.length * (60 / theme.bpm);
    expect(renderTheme(theme, 8000).length).toBeCloseTo(beats * 8000, -1);
  });
});

describe("volume", () => {
  it("clamps levels and falls back to the defaults", () => {
    expect(clampVolume({})).toEqual(DEFAULT_VOLUME);
    expect(clampVolume({ music: 2, sfx: -1 })).toEqual({ music: 1, sfx: 0 });
    expect(clampVolume({ music: Number.NaN })).toEqual(DEFAULT_VOLUME);
  });

  /** A minimal Web Audio stand-in recording gain levels and started sources. */
  function fakeContext() {
    const gains: { gain: { value: number } }[] = [];
    const started: { loop: boolean }[] = [];
    const context = {
      state: "running",
      currentTime: 0,
      sampleRate: 8000,
      destination: {},
      createGain() {
        const node = { gain: { value: 1 }, connect() {} };
        gains.push(node);
        return node;
      },
      createBuffer(_channels: number, length: number) {
        const data = new Float32Array(length);
        return { getChannelData: () => data };
      },
      createBufferSource() {
        const node = {
          buffer: null,
          loop: false,
          connect() {},
          disconnect() {},
          start() {
            started.push(node);
          },
          stop() {},
        };
        return node;
      },
    };
    return { context: context as unknown as AudioContext, gains, started };
  }

  it("applies volume changes live and stays silent at zero", () => {
    const fake = fakeContext();
    const player = new AudioPlayer(() => fake.context);
    player.playMusic("battle");
    const [music, sfx] = fake.gains;
    expect(music?.gain.value).toBe(DEFAULT_VOLUME.music);
    expect(sfx?.gain.value).toBe(DEFAULT_VOLUME.sfx);
    player.setVolume({ music: 0.2, sfx: 0.9 });
    expect(music?.gain.value).toBe(0.2);
    expect(sfx?.gain.value).toBe(0.9);
    expect(fake.started).toHaveLength(1);
    expect(fake.started[0]?.loop).toBe(true);

    player.setVolume({ sfx: 0 });
    player.playSfx("hit" satisfies SfxId);
    expect(fake.started).toHaveLength(1);
    player.setVolume({ sfx: 1 });
    player.playSfx("hit");
    player.playSfx("hit"); // same instant: dropped
    expect(fake.started).toHaveLength(2);
  });

  it("does nothing without Web Audio", () => {
    const player = new AudioPlayer(() => undefined);
    expect(() => {
      player.playMusic("menu");
      player.playSfx("spark");
      player.stopMusic();
    }).not.toThrow();
  });
});
