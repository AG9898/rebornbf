import { describe, expect, it } from "vitest";
import { createRng, nextFloat, nextInt, nextUint32, type RngState } from "./rng.ts";

function drawMany(rng: RngState, count: number): { values: number[]; rng: RngState } {
  const values: number[] = [];
  let current = rng;
  for (let i = 0; i < count; i++) {
    const draw = nextUint32(current);
    values.push(draw.value);
    current = draw.rng;
  }
  return { values, rng: current };
}

describe("seeded PRNG", () => {
  it("yields identical sequences for the same seed", () => {
    expect(drawMany(createRng(42), 100).values).toEqual(drawMany(createRng(42), 100).values);
  });

  it("yields different sequences for different seeds", () => {
    expect(drawMany(createRng(1), 10).values).not.toEqual(drawMany(createRng(2), 10).values);
  });

  it("resumes identically after a JSON round-trip mid-sequence", () => {
    const first = drawMany(createRng(1234), 50);
    const restored = JSON.parse(JSON.stringify(first.rng)) as RngState;
    expect(drawMany(restored, 50).values).toEqual(drawMany(first.rng, 50).values);
  });

  it("is pure: drawing does not mutate the input state", () => {
    const rng = createRng(7);
    const snapshot = JSON.stringify(rng);
    nextUint32(rng);
    expect(JSON.stringify(rng)).toBe(snapshot);
    expect(nextUint32(rng).value).toBe(nextUint32(rng).value);
  });

  it("produces 32-bit unsigned integers and floats in [0, 1)", () => {
    let rng = createRng(99);
    for (let i = 0; i < 1000; i++) {
      const draw = nextFloat(rng);
      expect(draw.value).toBeGreaterThanOrEqual(0);
      expect(draw.value).toBeLessThan(1);
      rng = draw.rng;
    }
    for (const value of drawMany(rng, 1000).values) {
      expect(Number.isInteger(value) && value >= 0 && value < 2 ** 32).toBe(true);
    }
  });

  it("nextInt covers an inclusive range", () => {
    let rng = createRng(5);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const draw = nextInt(rng, 0, 100);
      expect(draw.value).toBeGreaterThanOrEqual(0);
      expect(draw.value).toBeLessThanOrEqual(100);
      seen.add(draw.value);
      rng = draw.rng;
    }
    expect(seen.size).toBe(101);
    expect(nextInt(rng, 3, 3).value).toBe(3);
  });

  it("rejects invalid seeds and ranges", () => {
    expect(() => createRng(1.5)).toThrow(RangeError);
    expect(() => nextInt(createRng(1), 5, 4)).toThrow(RangeError);
  });

  it("treats negative seeds modulo 2^32", () => {
    expect(createRng(-1)).toEqual(createRng(2 ** 32 - 1));
  });
});
