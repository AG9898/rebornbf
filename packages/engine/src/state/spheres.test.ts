import { sphereContent, UnitSchema } from "@bfr/data";
import brandJson from "@bfr/data/content/units/brand.json";
import { describe, expect, it } from "vitest";
import { passiveStatTotal, refreshPassives } from "../effects/passive.ts";
import { attackTotal } from "../formulas/attack-stat.ts";
import { createRng, nextInt } from "../rng.ts";
import { step } from "../step.ts";
import { makeMember, makeSetup } from "../test/factories.ts";
import { createBattle } from "./create-battle.ts";

function sphere(id: string) {
  const content = sphereContent(id);
  if (!content) throw new Error(id);
  return content;
}
describe("sphere equipment", () => {
  it.each([0.1, 0.2])("adds %s to every stat, additive with other passives", (bonus) => {
    const member = {
      ...makeMember("test"),
      level: undefined,
      unitType: undefined,
      stats: { hp: 1000, atk: 1000, def: 1000, rec: 1000 },
      spheres: [sphere(bonus === 0.1 ? "wayfarer-seal" : "vanguard-seal")],
    };
    const state = createBattle({ ...makeSetup(1), squad: [member] }, 1);
    const unit = state.party[0];
    if (!unit) throw new Error("missing unit");
    // 1000 × (1 + 10%/20%) = 1100/1200. HP materialises once; combat stats use stat_mods.
    expect(unit.stats.hp).toBe(bonus === 0.1 ? 1100 : 1200);
    for (const stat of ["atk", "def", "rec"] as const) {
      expect(
        attackTotal({ atk: unit.stats[stat], statMods: passiveStatTotal(unit.effects, stat) }),
      ).toBe(bonus === 0.1 ? 1100 : 1200);
    }
    expect(refreshPassives(refreshPassives(state)).party[0]?.effects).toEqual(unit.effects);
  });
  it("refuses a locked slot even on Omni, and two all-stat spheres after unlock", () => {
    const member = {
      ...makeMember("brand"),
      unit: UnitSchema.parse(brandJson),
      formId: "brand-omni",
      spheres: [sphere("wayfarer-seal"), sphere("emberheart")],
    };
    expect(() => createBattle({ ...makeSetup(1), squad: [member] }, 1)).toThrow(/slot is locked/);
    expect(() =>
      createBattle(
        {
          ...makeSetup(1),
          squad: [
            {
              ...member,
              secondSphereSlot: true,
              spheres: [sphere("wayfarer-seal"), sphere("vanguard-seal")],
            },
          ],
        },
        1,
      ),
    ).toThrow(/two all-stat/);
  });
  it("unlocks only the matching Extra Skill and adds sphere stats in the same % sum", () => {
    const member = {
      ...makeMember("brand"),
      unit: UnitSchema.parse(brandJson),
      formId: "brand-7",
      level: undefined,
      unitType: undefined,
      stats: { hp: 1000, atk: 1000, def: 1000, rec: 1000 },
      secondSphereSlot: true,
    };
    const base = createBattle({ ...makeSetup(1), squad: [member] }, 1);
    const wrong = createBattle(
      { ...makeSetup(1), squad: [{ ...member, spheres: [sphere("tideglass")] }] },
      1,
    );
    const equipped = createBattle(
      {
        ...makeSetup(1),
        squad: [{ ...member, spheres: [sphere("wayfarer-seal"), sphere("emberheart")] }],
      },
      1,
    );
    expect(wrong.party[0]?.effects.filter((e) => e.source === "extra")).toEqual(
      base.party[0]?.effects.filter((e) => e.source === "extra"),
    );
    const extra = equipped.party[0]?.effects.filter((e) => e.source === "extra") ?? [];
    expect(extra.length).toBeGreaterThan(0);
    // Sphere HP +10% +30%, plus the now-active ES HP; all additive, not compounded.
    const baseMods = passiveStatTotal(base.party[0]?.effects ?? [], "hp");
    expect(equipped.party[0]?.stats.hp).toBe(
      attackTotal({ atk: 1000, statMods: baseMods + 0.4 + passiveStatTotal(extra, "hp") }),
    );
  });
  it("fills once per attacking action with deterministic integer RNG, never for a rejected action", () => {
    const member = { ...makeMember("test"), spheres: [sphere("gravewell")] };
    const state = createBattle({ ...makeSetup(1), squad: [member] }, 77);
    const expected = nextInt(createRng(77), 4, 6).value;
    const input = { type: "attack" as const, tick: 0, actor: "p0" as const, target: "e0" as const };
    const result = step(state, [input]);
    expect(
      result.events.filter((e) => e.type === "GaugeFilled" && e.effect === "bb.fill_on_attack"),
    ).toHaveLength(1);
    expect(result.events).toContainEqual(
      expect.objectContaining({ type: "GaugeFilled", gained: expected }),
    );
    expect(step(state, [input])).toEqual(result);
    expect(
      step(result.state, [{ ...input, tick: result.state.tick }]).events.some(
        (e) => e.type === "GaugeFilled",
      ),
    ).toBe(false);
  });
});
