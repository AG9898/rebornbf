import { sphereContent } from "@bfr/data";
import { describe, expect, it } from "vitest";
import {
  equipSphereErrorMessage,
  type OwnedSphereRow,
  ownedSphereEntries,
  sphereSockets,
  sphereSummary,
  toSphereView,
  type UnitSphereRow,
} from "./spheres.ts";

const UNIT = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const OWNED: OwnedSphereRow[] = [
  { id: "s1", sphere_id: "vanguard-seal", created_at: "2026-09-01T00:00:00Z" },
  { id: "s2", sphere_id: "emberheart", created_at: "2026-09-02T00:00:00Z" },
  { id: "s3", sphere_id: "wayfarer-seal", created_at: "2026-09-03T00:00:00Z" },
];
const EQUIPPED: UnitSphereRow[] = [
  { owned_unit_id: UNIT, slot: 1, owned_sphere_id: "s2" },
  { owned_unit_id: OTHER, slot: 1, owned_sphere_id: "s3" },
];

describe("Equip Sphere view (M4-06J)", () => {
  it("summarises stat boosts and the remaining effects", () => {
    const vanguard = sphereContent("vanguard-seal");
    const ember = sphereContent("emberheart");
    if (!vanguard || !ember) throw new Error("missing launch sphere");
    expect(sphereSummary(vanguard)).toBe("All stats +20%");
    expect(sphereSummary(ember)).toBe("ATK, HP +30% · +1 effect");
  });

  it("names signature spheres by their unit", () => {
    expect(toSphereView({ id: "s2", sphere_id: "emberheart" })).toMatchObject({
      name: "Emberheart",
      kindLabel: "Signature · Brand",
    });
    expect(toSphereView({ id: "s1", sphere_id: "vanguard-seal" }).kindLabel).toBe("All-stat");
  });

  it("fills the unit's sockets and locks slot 2 until unlocked", () => {
    const locked = sphereSockets(UNIT, false, EQUIPPED, OWNED);
    expect(locked.map((s) => [s.slot, s.unlocked, s.sphere?.name ?? null])).toEqual([
      [1, true, "Emberheart"],
      [2, false, null],
    ]);
    expect(sphereSockets(UNIT, true, EQUIPPED, OWNED)[1]?.unlocked).toBe(true);
  });

  it("lists owned spheres by name with where each is equipped", () => {
    expect(ownedSphereEntries(UNIT, EQUIPPED, OWNED).map((e) => [e.name, e.equipped])).toEqual([
      ["Emberheart", { onThisUnit: true, slot: 1 }],
      ["Vanguard Seal", null],
      ["Wayfarer Seal", { onThisUnit: false }],
    ]);
  });

  it("turns equip_sphere refusals into messages", () => {
    expect(equipSphereErrorMessage("22023", "equip_sphere: second slot locked")).toBe(
      "This unit's second sphere slot is locked.",
    );
    expect(equipSphereErrorMessage("22023", "equip_sphere: sphere not owned or unknown")).toBe(
      "You do not own that sphere.",
    );
    expect(equipSphereErrorMessage("42501", "equip_sphere: not signed in")).toBe(
      "The sphere could not be equipped.",
    );
  });
});
