import { describe, expect, it } from "vitest";
import { contentId, toAttack } from "./unit.ts";

describe("contentId", () => {
  // Made-up names: the public export guard rejects original ones in code.
  it("kebab-cases names", () => {
    expect(contentId("Ember Mecha Warden")).toBe("ember-mecha-warden");
    expect(contentId("Tallow ")).toBe("tallow");
    expect(contentId("Ash & Cinder")).toBe("ash-and-cinder");
    expect(contentId("Ka'Lin")).toBe("ka-lin");
    expect(contentId("Rosé")).toBe("rose");
  });
});

describe("toAttack", () => {
  it("takes the first hit as the start delay and later hits as offsets", () => {
    const attack = toAttack(
      { "frame times": [26, 44, 62], "hit dmg% distribution": [50, 30, 20], hits: 3 },
      "melee",
      2,
    );
    expect(attack).toEqual({
      moveType: "melee",
      startDelayFrames: 26,
      hitFrames: [0, 18, 36],
      damageDistribution: [50, 30, 20],
      dropChecks: 6,
    });
  });

  it("adds the proc's delay frames to the start delay", () => {
    const attack = toAttack(
      {
        "frame times": [15, 33],
        "hit dmg% distribution": [60, 40],
        hits: 2,
        "effect delay time(ms)/frame": "33.3/2",
      },
      "ranged",
      1,
    );
    expect(attack.startDelayFrames).toBe(17);
    expect(attack.hitFrames).toEqual([0, 18]);
    expect(attack.dropChecks).toBe(2);
  });

  it("sorts out-of-order frames with their shares", () => {
    const attack = toAttack(
      { "frame times": [70, 90, 86], "hit dmg% distribution": [20, 50, 30], hits: 3 },
      "teleport",
      1,
    );
    expect(attack.hitFrames).toEqual([0, 16, 20]);
    expect(attack.damageDistribution).toEqual([20, 30, 50]);
  });
});
