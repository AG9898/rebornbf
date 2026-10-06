import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { toUnitDetailView } from "../../../../lib/units/owned-units.ts";
import { unitSkillDisplays } from "../../../../lib/units/unit-skills.ts";
import { UnitInfoBody } from "./UnitInfoBody.tsx";

const skills = unitSkillDisplays(
  toUnitDetailView({
    id: "00000000-0000-4000-8000-000000000001",
    unit_id: "aurelle",
    form_id: "aurelle-omni",
    level: 150,
    exp: 0,
    bb_level: 10,
    sbb_level: 10,
  }),
);
const find = (key: string) => skills.find((skill) => skill.key === key) ?? null;
const bursts = skills.filter((skill) => ["bb", "sbb", "ubb"].includes(skill.key));

function render(burstList = bursts): string {
  return renderToStaticMarkup(
    createElement(UnitInfoBody, {
      hero: null,
      actions: null,
      leader: find("leader"),
      extra: find("extra"),
      bursts: burstList,
    }),
  );
}

describe("Unit Info body (reworked 2026-10-06)", () => {
  it("pins only the Leader Skill and the first burst, with the burst's colour tag", () => {
    const html = render();
    expect(bursts.map((burst) => burst.key)).toEqual(["bb", "sbb", "ubb"]);
    expect(html).toContain(`Leader Skill: ${find("leader")?.name}`);
    expect(html).toContain(`Brave Burst: ${find("bb")?.name}`);
    expect(html).not.toContain(`Super Brave Burst: ${find("sbb")?.name}`);
    expect(html).not.toContain(`Extra Skill: ${find("extra")?.name}`);
    expect(html).toContain("skill-tag-blue.webp");
  });

  it("offers Switch only when the form has more than one burst tier", () => {
    expect(render()).toContain(">Switch<");
    expect(render(bursts.slice(0, 1))).not.toContain(">Switch<");
  });

  it("keeps the skill panels closed until a row is held or tapped", () => {
    expect(render()).not.toContain('role="dialog"');
  });
});
