/**
 * Seeded, serializable PRNG (sfc32, seeded through splitmix32).
 *
 * The state is a plain JSON-safe object stored in `BattleState`; every draw is a pure function
 * returning the value and the next state, so a battle serialized mid-fight resumes with the exact
 * same sequence. Never use `Math.random` in the engine (CONVENTIONS → Engine).
 */
export interface RngState {
  /** Four 32-bit unsigned words of sfc32 state. */
  readonly s: readonly [number, number, number, number];
}

export interface RngDraw<T> {
  readonly value: T;
  readonly rng: RngState;
}

/** Number of warm-up draws discarded after seeding (standard for sfc32). */
const WARMUP_DRAWS = 12;
const UINT32_RANGE = 0x1_0000_0000;

/** splitmix32 step: expands one 32-bit seed into well-mixed words. */
function splitmix32(state: number): { value: number; state: number } {
  const next = (state + 0x9e3779b9) >>> 0;
  let z = next;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
  z = (z ^ (z >>> 15)) >>> 0;
  return { value: z, state: next };
}

/** Creates the PRNG state for an integer seed (taken modulo 2^32). */
export function createRng(seed: number): RngState {
  if (!Number.isSafeInteger(seed)) {
    throw new RangeError(`seed must be a safe integer (got ${seed})`);
  }
  let mix = ((seed % UINT32_RANGE) + UINT32_RANGE) % UINT32_RANGE;
  const words: number[] = [];
  for (let i = 0; i < 4; i++) {
    const step = splitmix32(mix);
    mix = step.state;
    words.push(step.value);
  }
  let rng: RngState = { s: [words[0] ?? 0, words[1] ?? 0, words[2] ?? 0, words[3] ?? 0] };
  for (let i = 0; i < WARMUP_DRAWS; i++) {
    rng = nextUint32(rng).rng;
  }
  return rng;
}

/** Draws a uniform 32-bit unsigned integer. */
export function nextUint32(rng: RngState): RngDraw<number> {
  let [a, b, c, d] = rng.s;
  const t = (((a + b) >>> 0) + d) >>> 0;
  d = (d + 1) >>> 0;
  a = (b ^ (b >>> 9)) >>> 0;
  b = (c + (c << 3)) >>> 0;
  c = ((c << 21) | (c >>> 11)) >>> 0;
  c = (c + t) >>> 0;
  return { value: t, rng: { s: [a, b, c, d] } };
}

/** Draws a float in [0, 1). */
export function nextFloat(rng: RngState): RngDraw<number> {
  const draw = nextUint32(rng);
  return { value: draw.value / UINT32_RANGE, rng: draw.rng };
}

/**
 * Draws an integer in [min, max] inclusive (e.g. the 0–100 drop roll, GAME_DESIGN §2).
 * Uses rejection sampling so every value is equally likely.
 */
export function nextInt(rng: RngState, min: number, max: number): RngDraw<number> {
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max < min) {
    throw new RangeError(`invalid integer range [${min}, ${max}]`);
  }
  const span = max - min + 1;
  if (span > UINT32_RANGE) {
    throw new RangeError(`integer range [${min}, ${max}] exceeds 2^32 values`);
  }
  const limit = UINT32_RANGE - (UINT32_RANGE % span);
  let current = rng;
  for (;;) {
    const draw = nextUint32(current);
    current = draw.rng;
    if (draw.value < limit) {
      return { value: min + (draw.value % span), rng: current };
    }
  }
}
