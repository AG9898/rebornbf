import { describe, expect, it } from "vitest";
import { ORIGINAL_ASSETS } from "../original/original-assets.ts";
import { FUSION_ASSETS } from "./fusion-screen.ts";

describe("original Fusion screen", () => {
  it("imports every preparation, result, and held-button piece", () => {
    for (const asset of Object.values(FUSION_ASSETS)) {
      expect(asset in ORIGINAL_ASSETS, asset).toBe(true);
    }
    for (const [normal, pressed] of [
      [FUSION_ASSETS.squareNormal, FUSION_ASSETS.baseNormal],
      [FUSION_ASSETS.squareNormal, FUSION_ASSETS.statusNormal],
      [FUSION_ASSETS.wideNormal, FUSION_ASSETS.fuseNormal],
      [FUSION_ASSETS.squareNormal, FUSION_ASSETS.skipNormal],
    ] as const) {
      expect(ORIGINAL_ASSETS[normal], pressed).toEqual(ORIGINAL_ASSETS[pressed]);
    }
  });
});
