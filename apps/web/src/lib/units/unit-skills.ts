import { type Burst, type Form, isAttackShapeId } from "@bfr/data";
import { formAtBurstLevels } from "@bfr/engine";
import { type OwnedUnitView, unitContent } from "./owned-units.ts";
import { describeEffect } from "./skill-effects.ts";

export type SkillDisplay = {
  key: "leader" | "extra" | "bb" | "sbb" | "ubb";
  label: string;
  name: string;
  level?: number;
  cost?: number;
  effects: string[];
};

export function leaderSkillDisplay(
  unit: Pick<OwnedUnitView, "unitId" | "formId"> | null | undefined,
): SkillDisplay | null {
  const skill =
    unit && unitContent(unit.unitId)?.forms.find((f) => f.id === unit.formId)?.leaderSkill;
  return skill
    ? {
        key: "leader",
        label: "Leader Skill",
        name: skill.name,
        effects: skill.effects.map(describeEffect),
      }
    : null;
}

/** Match engine availability: SBB/Extra Skill are form grants; UBB requires max burst levels. */
export function formSkillDisplays(form: Form, bb = 1, sbb = 1): SkillDisplay[] {
  const scaled = formAtBurstLevels(form, { bb, sbb });
  const displays: SkillDisplay[] = [];
  for (const [key, label, skill] of [
    ["leader", "Leader Skill", form.leaderSkill],
    ["extra", "Extra Skill", form.extraSkill],
  ] as const) {
    if (skill)
      displays.push({ key, label, name: skill.name, effects: skill.effects.map(describeEffect) });
  }
  for (const tier of ["bb", "sbb", "ubb"] as const) {
    const burst = scaled.bursts[tier];
    if (!burst || (!burst.attacks.length && !burst.effects.length)) continue;
    displays.push({
      key: tier,
      label: { bb: "Brave Burst", sbb: "Super Brave Burst", ubb: "Ultimate Brave Burst" }[tier],
      name: burst.name,
      level: tier === "ubb" ? 1 : tier === "bb" ? bb : sbb,
      cost: burst.cost,
      effects: burstDescriptions(burst),
    });
  }
  return displays;
}

function burstDescriptions(burst: Burst): string[] {
  let index = 0;
  return burst.effects.map((effect) => {
    const shape = isAttackShapeId(effect.id);
    const attack = shape ? burst.attacks[index++] : undefined;
    return `${attack ? `${attack.hitFrames.length} hits — ` : ""}${describeEffect(effect)}`;
  });
}

export function unitSkillDisplays(
  unit: OwnedUnitView & { bbLevel?: number; sbbLevel?: number },
): SkillDisplay[] {
  const form = unitContent(unit.unitId)?.forms.find((f) => f.id === unit.formId);
  return form ? formSkillDisplays(form, unit.bbLevel, unit.sbbLevel) : [];
}
