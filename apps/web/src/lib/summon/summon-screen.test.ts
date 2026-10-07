import { describe, expect, it } from "vitest";
import { ORIGINAL_ASSETS } from "../original/original-assets.ts";
import { SUMMON_BANNERS } from "./summon.ts";
import {
  isConfirmStep,
  SUMMON_BANNER_ART,
  SUMMON_CONFIRM_PATH,
  SUMMON_SCREEN_ASSETS,
  summonsAffordable,
} from "./summon-screen.ts";

describe("Summon screen (M8-11)", () => {
  it("draws only imported original pieces", () => {
    expect(SUMMON_SCREEN_ASSETS.length).toBeGreaterThan(0);
    for (const asset of SUMMON_SCREEN_ASSETS) expect(asset in ORIGINAL_ASSETS, asset).toBe(true);
  });

  it("gives every open banner its original banner and door art", () => {
    for (const banner of SUMMON_BANNERS)
      expect(SUMMON_BANNER_ART[banner.id], banner.id).toBeTruthy();
    expect(SUMMON_BANNER_ART["launch-summon"]?.banner).toBe("gacha/gacha_rare_bg_img.png");
  });

  it("opens the confirm window as a step of /summon", () => {
    expect(SUMMON_CONFIRM_PATH).toBe("/summon?step=confirm");
    expect(isConfirmStep("confirm")).toBe(true);
    expect(isConfirmStep(undefined)).toBe(false);
    expect(isConfirmStep(["confirm", "x"])).toBe(false);
  });

  it("counts the single summons the gems pay for", () => {
    expect(summonsAffordable(329, 5)).toBe(65);
    expect(summonsAffordable(4, 5)).toBe(0);
    expect(summonsAffordable(null, 5)).toBe(0);
  });
});
