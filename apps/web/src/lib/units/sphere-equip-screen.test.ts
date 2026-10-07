import { describe, expect, it } from "vitest";
import { ORIGINAL_ASSETS } from "../original/original-assets.ts";
import { initialSphereSlot, SPHERE_EQUIP_ASSETS, sphereEquipHint } from "./sphere-equip-screen.ts";
import type { SphereSocketView } from "./spheres.ts";

const SPHERE = {
  id: "s1",
  sphereId: "vanguard-seal",
  name: "Vanguard Seal",
  kindLabel: "",
  summary: "",
};

describe("original Equip Sphere screen (M8-09)", () => {
  it("imports every piece the screen names", () => {
    for (const asset of Object.values(SPHERE_EQUIP_ASSETS)) {
      expect(asset in ORIGINAL_ASSETS, asset).toBe(true);
    }
    expect(ORIGINAL_ASSETS[SPHERE_EQUIP_ASSETS.squareNormal]).toEqual(
      ORIGINAL_ASSETS[SPHERE_EQUIP_ASSETS.squarePressed],
    );
    expect(ORIGINAL_ASSETS[SPHERE_EQUIP_ASSETS.equipNormal]).toEqual(
      ORIGINAL_ASSETS[SPHERE_EQUIP_ASSETS.equipPressed],
    );
  });

  it("opens on the first empty unlocked slot, else slot 1", () => {
    const full: SphereSocketView = { slot: 1, unlocked: true, sphere: SPHERE };
    expect(initialSphereSlot([full, { slot: 2, unlocked: true, sphere: null }])).toBe(2);
    expect(initialSphereSlot([full, { slot: 2, unlocked: false, sphere: null }])).toBe(1);
    expect(initialSphereSlot([{ slot: 1, unlocked: true, sphere: null }])).toBe(1);
  });

  it("names the slot only when the unit has two", () => {
    expect(sphereEquipHint(1, 1)).toBe("Select a Sphere you wish to equip.");
    expect(sphereEquipHint(2, 2)).toBe("Select a Sphere to equip in Slot 2.");
  });
});
