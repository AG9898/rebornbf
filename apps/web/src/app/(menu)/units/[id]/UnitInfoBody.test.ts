import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ORIGINAL_ASSETS } from "../../../../lib/original/original-assets.ts";
import { toUnitDetailView } from "../../../../lib/units/owned-units.ts";
import {
  rarityMarkPieces,
  UNIT_INFO_ASSETS,
  unitInfoSkillLabel,
} from "../../../../lib/units/unit-info-screen.ts";
import { unitSkillDisplays } from "../../../../lib/units/unit-skills.ts";
import { RarityMark } from "./RarityMark.tsx";
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

describe("Unit Info body (M8-05)", () => {
  it("imports every original status, socket, and skill piece the screen names", () => {
    const pieces = Object.values(UNIT_INFO_ASSETS).flatMap((value) =>
      typeof value === "string" ? [value] : Object.values(value),
    );
    for (const piece of pieces) expect(piece in ORIGINAL_ASSETS).toBe(true);
    expect(unitInfoSkillLabel("sbb")).toBe(UNIT_INFO_ASSETS.sbb);
    expect(unitInfoSkillLabel("ubb")).toBe(UNIT_INFO_ASSETS.ubb);
    expect(unitInfoSkillLabel("bb")).toBeNull();
  });
  it("draws rarity with the original star art, shared with Equip Sphere", () => {
    expect(rarityMarkPieces(1)).toEqual([UNIT_INFO_ASSETS.star]);
    expect(rarityMarkPieces(7)).toEqual(Array(7).fill("common/star_rare.png"));
    expect(rarityMarkPieces("omni")).toEqual(["common/rarity_omni.png"]);
    for (const piece of [...rarityMarkPieces(7), ...rarityMarkPieces("omni")]) {
      expect(piece in ORIGINAL_ASSETS, piece).toBe(true);
    }
    const stars = renderToStaticMarkup(createElement(RarityMark, { rarity: 6, label: "6★" }));
    expect(stars).toContain('role="img"');
    expect(stars).toContain('aria-label="6★"');
    expect(stars.match(/<img[^>]*star_rare\.png/g)).toHaveLength(6);
    expect(stars).not.toContain("★</");
    const omni = renderToStaticMarkup(createElement(RarityMark, { rarity: "omni", label: "Omni" }));
    expect(omni).toContain('aria-label="Omni"');
    expect(omni.match(/<img[^>]*rarity_omni\.png/g)).toHaveLength(1);
    expect(omni).not.toContain("star_rare");
  });
  it("pins only the Leader Skill and the first burst, with the burst's colour tag", () => {
    const html = render();
    expect(bursts.map((burst) => burst.key)).toEqual(["bb", "sbb", "ubb"]);
    expect(html).toContain(`Leader Skill: ${find("leader")?.name}`);
    expect(html).toContain(`Brave Burst: ${find("bb")?.name}`);
    expect(html).not.toContain(`Super Brave Burst: ${find("sbb")?.name}`);
    expect(html).not.toContain(`Extra Skill: ${find("extra")?.name}`);
    expect(html).toContain("common/leader_burst_label/bb.png");
  });

  it("offers Switch only when the form has more than one burst tier", () => {
    expect(render()).toContain(">Switch<");
    expect(render(bursts.slice(0, 1))).not.toContain(">Switch<");
  });

  it("keeps the skill panels closed until a row is held or tapped", () => {
    expect(render()).not.toContain('role="dialog"');
  });
});
