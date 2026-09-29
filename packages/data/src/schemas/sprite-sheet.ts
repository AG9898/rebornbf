import { z } from "zod";
import { NonNegativeIntSchema, PositiveIntSchema } from "./common.ts";

/**
 * Battle sprite frame canvas in pixels (ART_GUIDE → Battle Sprites, RESOLVED-39). Every frame of a
 * unit sprite sheet is a square of this size, matching the locked-master sprite export.
 */
export const SPRITE_FRAME_SIZE = 128;

/** Engine ticks per second (GAME_DESIGN §2 Timing model). */
const TICKS_PER_SECOND = 60;

/** The Aseprite tag that marks a hit frame inside an attack animation. */
export const HIT_TAG = "hit";

/**
 * Animation tags every unit sheet must have (ART_GUIDE → Required animations). Every unit form gets
 * an idle loop first; `attack` and the other animations are optional until a form has them.
 */
export const REQUIRED_SPRITE_TAGS = ["idle"] as const;

const RectSchema = z.object({
  x: NonNegativeIntSchema,
  y: NonNegativeIntSchema,
  w: PositiveIntSchema,
  h: PositiveIntSchema,
});

/** One frame of an Aseprite "Hash" export; unknown export fields are allowed and ignored. */
const SheetFrameSchema = z.object({
  frame: RectSchema,
  sourceSize: z.object({ w: PositiveIntSchema, h: PositiveIntSchema }),
  /** Display time in milliseconds. */
  duration: PositiveIntSchema,
});

const FrameTagSchema = z.object({
  name: z.string().min(1),
  from: NonNegativeIntSchema,
  to: NonNegativeIntSchema,
  direction: z.string().optional(),
});

/**
 * An Aseprite sprite-sheet JSON export in hash format (`--format json-hash`, frame tags on).
 * Frame order is the key order of `frames`. Every frame must use the fixed
 * `SPRITE_FRAME_SIZE` canvas; tags must lie inside the frame list; `idle` must exist.
 */
export const SpriteSheetSchema = z
  .object({
    frames: z.record(z.string(), SheetFrameSchema),
    meta: z.object({
      image: z.string().min(1),
      size: z.object({ w: PositiveIntSchema, h: PositiveIntSchema }),
      frameTags: z.array(FrameTagSchema),
    }),
  })
  .superRefine((sheet, ctx) => {
    const frames = Object.entries(sheet.frames);
    for (const [name, frame] of frames) {
      const { w, h } = frame.sourceSize;
      if (w !== SPRITE_FRAME_SIZE || h !== SPRITE_FRAME_SIZE) {
        ctx.addIssue({
          code: "custom",
          path: ["frames", name, "sourceSize"],
          message: `must be ${SPRITE_FRAME_SIZE}×${SPRITE_FRAME_SIZE} (got ${w}×${h})`,
        });
      }
    }
    sheet.meta.frameTags.forEach((tag, i) => {
      if (tag.from > tag.to || tag.to >= frames.length) {
        ctx.addIssue({
          code: "custom",
          path: ["meta", "frameTags", i],
          message: `frames ${tag.from}–${tag.to} are outside the sheet's ${frames.length} frames`,
        });
      }
    });
    for (const name of REQUIRED_SPRITE_TAGS) {
      if (!sheet.meta.frameTags.some((tag) => tag.name === name)) {
        ctx.addIssue({
          code: "custom",
          path: ["meta", "frameTags"],
          message: `is missing the "${name}" animation tag`,
        });
      }
    }
  });
export type SpriteSheet = z.infer<typeof SpriteSheetSchema>;

/** The start delay and hit offsets an attack animation defines, in engine ticks. */
export interface SheetAttackTiming {
  readonly startDelayFrames: number;
  readonly hitFrames: number[];
}

/** Milliseconds from animation start to engine ticks, rounded half up (integer arithmetic). */
export function msToTicks(ms: number): number {
  return Math.floor((ms * TICKS_PER_SECOND + 500) / 1000);
}

/**
 * Reads an attack animation's hit timing from a sheet (ART_GUIDE → Battle Sprites). Each `hit`
 * tag inside the `animation` tag is one hit landing at the start of the tag's first frame; two
 * `hit` tags on one frame are two same-tick hits. A hit's time is the summed frame durations
 * from the animation start, converted to ticks. The first hit sets `startDelayFrames`, and
 * `hitFrames` are offsets from it, so `hitFrames[0]` is always 0.
 */
export function attackTimingFromSheet(sheet: SpriteSheet, animation: string): SheetAttackTiming {
  const range = sheet.meta.frameTags.find((tag) => tag.name === animation);
  if (!range) throw new Error(`sprite sheet has no "${animation}" tag`);
  const durations = Object.values(sheet.frames).map((frame) => frame.duration);
  const hitStarts = sheet.meta.frameTags
    .filter((tag) => tag.name === HIT_TAG && tag.from >= range.from && tag.from <= range.to)
    .map((tag) => tag.from)
    .sort((a, b) => a - b);
  if (hitStarts.length === 0) throw new Error(`"${animation}" has no "${HIT_TAG}" tags`);
  const ticks = hitStarts.map((frame) => {
    let ms = 0;
    for (let i = range.from; i < frame; i++) ms += durations[i] ?? 0;
    return msToTicks(ms);
  });
  const first = ticks[0] ?? 0;
  return { startDelayFrames: first, hitFrames: ticks.map((tick) => tick - first) };
}
