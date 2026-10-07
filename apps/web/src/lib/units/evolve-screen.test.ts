import { describe, expect, it } from "vitest";
import { ORIGINAL_ASSETS } from "../original/original-assets.ts";
import { EVOLVE_ASSETS } from "./evolve-screen.ts";

describe("original Evolve screen", () => {
  it("imports every preparation and held-button piece", () => {
    for (const asset of Object.values(EVOLVE_ASSETS)) {
      expect(asset in ORIGINAL_ASSETS, asset).toBe(true);
    }
    for (const state of ["normal", "pressed"] as const) {
      const label = state === "normal" ? EVOLVE_ASSETS.labelNormal : EVOLVE_ASSETS.labelPressed;
      expect(ORIGINAL_ASSETS[EVOLVE_ASSETS[state]]).toEqual(ORIGINAL_ASSETS[label]);
    }
  });
});
