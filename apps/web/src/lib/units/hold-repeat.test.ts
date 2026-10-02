import { describe, expect, it } from "vitest";
import {
  HOLD_FASTEST_MS,
  HOLD_FIRST_REPEAT_MS,
  HOLD_START_MS,
  holdRepeatDelay,
} from "./hold-repeat.ts";

describe("hold-to-repeat timing (M4-01F)", () => {
  it("starts slower than a tap and speeds up to a floor", () => {
    expect(HOLD_START_MS).toBeGreaterThan(HOLD_FIRST_REPEAT_MS);
    expect(holdRepeatDelay(0)).toBe(HOLD_FIRST_REPEAT_MS);
    for (let n = 1; n < 40; n += 1) {
      expect(holdRepeatDelay(n)).toBeLessThanOrEqual(holdRepeatDelay(n - 1));
    }
    expect(holdRepeatDelay(40)).toBe(HOLD_FASTEST_MS);
    expect(holdRepeatDelay(-3)).toBe(HOLD_FIRST_REPEAT_MS);
  });

  it("fills a 99-copy slot in a few seconds", () => {
    let total = HOLD_START_MS;
    for (let n = 0; n < 98; n += 1) total += holdRepeatDelay(n);
    expect(total).toBeLessThan(5000);
  });
});
