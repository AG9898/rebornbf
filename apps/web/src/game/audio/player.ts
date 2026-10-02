import {
  type AudioVolume,
  clampVolume,
  DEFAULT_VOLUME,
  type MusicId,
  PLACEHOLDER_MUSIC,
  PLACEHOLDER_SFX,
  renderTheme,
  renderTones,
  type SfxId,
} from "./sounds.ts";

/** The same effect retriggered within this window is dropped (multi-hit attacks land per tick). */
const SFX_RETRIGGER_MS = 35;

/**
 * Plays music and sound effects through one Web Audio context with a gain node per channel, so a
 * volume change applies live to what is already playing. Shared by the Phaser battle scene and
 * React screens (`gameAudio()`). Before a user gesture the browser keeps the context suspended;
 * the first pointer press resumes it.
 */
export class AudioPlayer {
  private context: AudioContext | undefined;
  private musicGain: GainNode | undefined;
  private sfxGain: GainNode | undefined;
  private volume: AudioVolume = DEFAULT_VOLUME;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly lastPlayed = new Map<SfxId, number>();
  private music: { id: MusicId; source: AudioBufferSourceNode } | undefined;

  constructor(private readonly createContext: () => AudioContext | undefined) {}

  /** The current levels. */
  get levels(): AudioVolume {
    return this.volume;
  }

  /** Sets the music and SFX levels (0–1, clamped); playing sounds follow at once. */
  setVolume(volume: Partial<AudioVolume>): void {
    this.volume = clampVolume({ ...this.volume, ...volume });
    if (this.musicGain) this.musicGain.gain.value = this.volume.music;
    if (this.sfxGain) this.sfxGain.gain.value = this.volume.sfx;
  }

  playSfx(id: SfxId): void {
    if (this.volume.sfx <= 0) return;
    const context = this.ensureContext();
    if (!context || !this.sfxGain) return;
    const now = context.currentTime * 1000;
    const last = this.lastPlayed.get(id);
    if (last !== undefined && now - last < SFX_RETRIGGER_MS) return;
    this.lastPlayed.set(id, now);
    const source = context.createBufferSource();
    source.buffer = this.buffer(context, `sfx:${id}`, () =>
      renderTones(PLACEHOLDER_SFX[id], context.sampleRate),
    );
    source.connect(this.sfxGain);
    source.start();
  }

  /** Loops `id`; a theme already playing keeps playing, any other is replaced. */
  playMusic(id: MusicId): void {
    if (this.music?.id === id) return;
    this.stopMusic();
    const context = this.ensureContext();
    if (!context || !this.musicGain) return;
    const source = context.createBufferSource();
    source.buffer = this.buffer(context, `music:${id}`, () =>
      renderTheme(PLACEHOLDER_MUSIC[id], context.sampleRate),
    );
    source.loop = true;
    source.connect(this.musicGain);
    source.start();
    this.music = { id, source };
  }

  stopMusic(): void {
    if (!this.music) return;
    try {
      this.music.source.stop();
    } catch {
      // Already stopped.
    }
    this.music.source.disconnect();
    this.music = undefined;
  }

  private ensureContext(): AudioContext | undefined {
    if (this.context) {
      if (this.context.state === "suspended") void this.context.resume().catch(() => {});
      return this.context;
    }
    const context = this.createContext();
    if (!context) return undefined;
    this.context = context;
    this.musicGain = context.createGain();
    this.musicGain.gain.value = this.volume.music;
    this.musicGain.connect(context.destination);
    this.sfxGain = context.createGain();
    this.sfxGain.gain.value = this.volume.sfx;
    this.sfxGain.connect(context.destination);
    if (context.state === "suspended" && typeof window !== "undefined") {
      const resume = (): void => {
        void context.resume().catch(() => {});
      };
      window.addEventListener("pointerdown", resume, { once: true });
      window.addEventListener("keydown", resume, { once: true });
    }
    return context;
  }

  private buffer(context: AudioContext, key: string, render: () => Float32Array): AudioBuffer {
    const cached = this.buffers.get(key);
    if (cached) return cached;
    const samples = render();
    const buffer = context.createBuffer(1, Math.max(1, samples.length), context.sampleRate);
    buffer.getChannelData(0).set(samples);
    this.buffers.set(key, buffer);
    return buffer;
  }
}

function browserContext(): AudioContext | undefined {
  if (typeof window === "undefined" || typeof window.AudioContext !== "function") return undefined;
  try {
    return new window.AudioContext();
  } catch {
    return undefined;
  }
}

let shared: AudioPlayer | undefined;

/** The page's one audio player; does nothing on the server or without Web Audio. */
export function gameAudio(): AudioPlayer {
  shared ??= new AudioPlayer(browserContext);
  return shared;
}
