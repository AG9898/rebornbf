import { isAttackShapeId } from "@bfr/data";
import { burstAtLevel } from "@bfr/engine";
import { describe, expect, it } from "vitest";
import { toUnitDetailView, unitContent } from "./owned-units.ts";
import { describeEffect } from "./skill-effects.ts";
import { formSkillDisplays, leaderSkillDisplay, unitSkillDisplays } from "./unit-skills.ts";

describe("skill effects and availability", () => {
  it("shows saved BB/SBB levels and scales using the engine, never kit-level values", () => {
    const unit = toUnitDetailView({
      id: "owned",
      unit_id: "brand",
      form_id: "brand-7",
      level: 1,
      exp: 0,
      bb_level: 4,
      sbb_level: 7,
    });
    const skills = unitSkillDisplays(unit);
    const form = unitContent("brand")?.forms.find((f) => f.id === "brand-7");
    if (!form) throw new Error("Missing Brand form");
    for (const [key, level] of [
      ["bb", 4],
      ["sbb", 7],
    ] as const) {
      const canonical = form.bursts[key];
      if (!canonical) throw new Error("Missing burst");
      const burst = burstAtLevel(canonical, level);
      const display = skills.find((s) => s.key === key);
      expect(display?.level).toBe(level);
      expect(display?.cost).toBe(burst.cost);
      const effect = burst.effects.find((e) => !isAttackShapeId(e.id));
      if (effect) expect(display?.effects).toContain(describeEffect(effect));
    }
    expect(skills.some((s) => s.key === "ubb")).toBe(false);
    // BB L4: round(2.5 × 21/27, 3) = 1.944; flat ATK round(80 × 21/27) = 62.
    expect(skills.find((s) => s.key === "bb")?.effects).toContain(
      "12 hits — Attack: 194.4% BB damage modifier, +62 flat ATK (all enemies)",
    );
    expect(skills.find((s) => s.key === "bb")?.cost).toBe(30);
    expect(skills.find((s) => s.key === "sbb")?.effects).toContain(
      "ATK +97.8% (all allies) for 3 turns",
    );
  });

  it("hides absent tiers and locked UBB, without inventing SBB/Extra unlock rules", () => {
    const forms = unitContent("brand")?.forms;
    if (!forms) throw new Error("Missing Brand");
    const low = forms.find((f) => f.id === "brand-3");
    const high = forms.find((f) => f.id === "brand-7");
    if (!low || !high) throw new Error("Missing forms");
    expect(formSkillDisplays(low).map((s) => s.key)).toEqual(["leader", "bb"]);
    expect(formSkillDisplays(high, 10, 9).map((s) => s.key)).not.toContain("ubb");
    expect(formSkillDisplays(high, 9, 10).map((s) => s.key)).not.toContain("ubb");
    expect(formSkillDisplays(high, 10, 10).find((s) => s.key === "ubb")?.level).toBe(1);
    expect(formSkillDisplays(high, 1, 1).map((s) => s.key)).toContain("extra");
  });

  it("defaults untouched owned copies to burst level 1 and tolerates unknown content", () => {
    const row = { id: "owned", unit_id: "brand", form_id: "brand-3", level: 1, exp: 0 };
    expect(unitSkillDisplays(toUnitDetailView(row)).find((s) => s.key === "bb")?.level).toBe(1);
    expect(unitSkillDisplays(toUnitDetailView({ ...row, unit_id: "unknown" }))).toEqual([]);
    expect(leaderSkillDisplay(undefined)).toBeNull();
  });

  it("includes target, element restriction, duration, chance, ranges and nested conditions", () => {
    expect(
      describeEffect({
        id: "passive.stat_pct",
        stat: "atk",
        value: 0.25,
        element: "fire",
        target: "party",
      }),
    ).toBe("ATK +25% (Fire allies)");
    expect(
      describeEffect({
        id: "debuff.atk_down",
        value: 0.3,
        chance: 20,
        turns: 2,
        target: "enemies",
      }),
    ).toBe("20% chance: Reduce ATK by 30% (all enemies) for 2 turns");
    expect(
      describeEffect({
        id: "heal.instant",
        value: 0,
        min: 1000,
        max: 1200,
        recBonus: 0.5,
        target: "party",
      }),
    ).toBe("Recover 1000–1200 HP + recipient REC + 50% of healer REC (all allies)");
    expect(describeEffect({ id: "bb.fill_instant", value: 999, target: "party" })).toBe(
      "Fill BB gauge completely (all allies)",
    );
    expect(
      describeEffect({
        id: "cond.signature_sphere",
        value: 0,
        target: "self",
        effects: [{ id: "buff.atk", value: 0.5, target: "self" }],
      }),
    ).toContain("signature sphere is equipped: ATK +50%");
    expect(
      describeEffect({ id: "ailment.inflict.poison", value: 75, target: "enemies" }),
    ).toContain("75% chance to inflict poison");
  });

  it("describes every launch form with no raw IDs, source names or omitted attacks", () => {
    for (const id of [
      "brand",
      "maren",
      "rook",
      "garrick",
      "solen",
      "morrick",
      "aurelle",
      "vespera",
      "cinder-sprite",
      "brass-crucible",
    ]) {
      const unit = unitContent(id);
      if (!unit) throw new Error(`Missing ${id}`);
      for (const form of unit.forms) {
        for (const level of [1, 10]) {
          const skills = formSkillDisplays(form, level, level);
          for (const skill of skills) {
            expect(skill.effects.length).toBeGreaterThan(0);
            expect(skill.effects.join(" ")).not.toMatch(
              /undefined|NaN|passive\.|buff\.|cond\.|attack\./,
            );
            if (skill.key === "bb" || skill.key === "sbb" || skill.key === "ubb") {
              expect(skill.effects.filter((text) => text.includes(" hits — ")).length).toBe(
                form.bursts[skill.key]?.attacks.length,
              );
            }
          }
        }
      }
    }
  });
});
