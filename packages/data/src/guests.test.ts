import { describe, expect, it } from "vitest";
import aurelleJson from "../content/units/aurelle.json";
import brandJson from "../content/units/brand.json";
import vesperaJson from "../content/units/vespera.json";
import { resolveGuest } from "./guests.ts";
import { UnitSchema } from "./schemas/unit.ts";
import { validateGuestFile } from "./validate.ts";

const units = new Map(
  [brandJson, aurelleJson, vesperaJson].map((json) => {
    const unit = UnitSchema.parse(json);
    return [unit.id, unit];
  }),
);
const guest = { id: "aurelle", unit: "aurelle", rarityCap: 6 };
const owned = (unitId: string, formId: string, level: number) => ({ unitId, formId, level });

describe("guest progress (ROSTER → Guest Units)", () => {
  it("uses highest rarity and level independently and clamps at the guest form maximum", () => {
    const result = resolveGuest(
      guest,
      [owned("brand", "brand-7", 1), owned("vespera", "vespera-omni", 150)],
      units,
    );
    expect(result?.form.id).toBe("aurelle-6");
    expect(result?.level).toBe(100);
  });
  it("lifts the cap only to the same unit's highest owned rarity", () => {
    const progress = [owned("brand", "brand-omni", 150), owned("aurelle", "aurelle-7", 1)];
    expect(resolveGuest(guest, progress, units)?.form.id).toBe("aurelle-7");
    expect(
      resolveGuest(guest, [...progress, owned("aurelle", "aurelle-omni", 1)], units)?.form.id,
    ).toBe("aurelle-omni");
    expect(
      resolveGuest({ ...guest, id: "vespera", unit: "vespera" }, progress, units)?.form.id,
    ).toBe("vespera-6");
  });
  it("starts at the player's early progress, and has no guest without owned units", () => {
    expect(resolveGuest(guest, [owned("brand", "brand-3", 17)], units)?.form.id).toBe("aurelle-3");
    expect(resolveGuest(guest, [owned("brand", "brand-3", 17)], units)?.level).toBe(17);
    expect(resolveGuest(guest, [], units)).toBeNull();
  });
  it("rejects missing unit references and client supplied form or level in content", () => {
    expect(validateGuestFile("aurelle.json", guest, new Set(units.keys()))).toEqual([]);
    expect(validateGuestFile("aurelle.json", guest, new Set())).not.toEqual([]);
    expect(
      validateGuestFile("aurelle.json", { ...guest, level: 150 }, new Set(units.keys())),
    ).not.toEqual([]);
  });
});
