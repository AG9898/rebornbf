import { describe, expect, it } from "vitest";
import {
  EVOLVE_REDUCED_FADE_MS,
  EVOLVE_STEPS,
  evolveRarityWord,
  evolveStepMs,
  evolveTheme,
  firstEvolveStep,
  nextEvolveStep,
} from "./evolve-cinematic.ts";

describe("evolve cinematic (M4-06M)", () => {
  it("names the rarity word by the new form's rarity", () => {
    expect(evolveRarityWord(2)).toBe("RARE");
    expect(evolveRarityWord(3)).toBe("RARE");
    expect(evolveRarityWord(4)).toBe("SUPER RARE");
    expect(evolveRarityWord(5)).toBe("MEGA RARE");
    expect(evolveRarityWord(7)).toBe("MEGA RARE");
    expect(evolveRarityWord("omni")).toBe("MEGA RARE");
  });

  it("themes 4★ and below gold, 5★ red, 6★ and above rainbow", () => {
    expect(evolveTheme(3)).toBe("gold");
    expect(evolveTheme(4)).toBe("gold");
    expect(evolveTheme(5)).toBe("red");
    expect(evolveTheme(6)).toBe("rainbow");
    expect(evolveTheme(7)).toBe("rainbow");
    expect(evolveTheme("omni")).toBe("rainbow");
  });

  it("walks the full sequence in order and ends on the reveal", () => {
    const seen: string[] = [];
    let step = firstEvolveStep(false);
    for (;;) {
      seen.push(step);
      const next = nextEvolveStep(step);
      if (!next) break;
      step = next;
    }
    expect(seen).toEqual([...EVOLVE_STEPS.map((s) => s.step), "reveal"]);
    expect(evolveStepMs("reveal")).toBeNull();
    expect(evolveStepMs("beam")).toBe(EVOLVE_STEPS.find((s) => s.step === "beam")?.ms);
  });

  it("plays only a short fade under reduced motion", () => {
    expect(firstEvolveStep(true)).toBe("fade");
    expect(nextEvolveStep("fade")).toBe("reveal");
    expect(evolveStepMs("fade")).toBe(EVOLVE_REDUCED_FADE_MS);
  });
});
