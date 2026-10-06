import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SkillDisplay } from "../../lib/units/unit-skills.ts";
import { leaderSkillDisplay } from "../../lib/units/unit-skills.ts";
import { SkillRow, skillTag } from "./SkillRow.tsx";

describe("shared skill row", () => {
  it("renders separate name/effect strips and a labelled full-text dialog", () => {
    const skill = leaderSkillDisplay({ unitId: "brand", formId: "brand-3" });
    const html = renderToStaticMarkup(createElement(SkillRow, { skill }));
    expect(html).toContain("skill-tag-red.webp");
    expect(html).toContain("ATK +25%");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("<dialog");
    expect(html).toContain("aria-labelledby=");
    expect(html).toContain(">Close</button>");
    expect(html).not.toContain("data-scrolling");
  });
  it("shows a disabled None row when no leader skill exists", () => {
    const html = renderToStaticMarkup(createElement(SkillRow, { skill: null }));
    expect(html).toContain("disabled");
    expect(html).toContain("No Leader Skill");
  });
  it("shows the burst level outside the scrolling name and gauge cost in the dialog", () => {
    const html = renderToStaticMarkup(
      createElement(SkillRow, {
        skill: {
          key: "sbb",
          label: "Super Brave Burst",
          name: "Long burst",
          level: 6,
          cost: 24,
          effects: ["ATK +100% (all allies) for 3 turns"],
        },
      }),
    );
    expect(html).toContain("skill-tag-gold.webp");
    expect(html).toContain("Lv.6");
    expect(html).toContain("Gauge cost: 24 BC");
    expect(html).toContain("Super BB");
  });

  it("colours bursts blue / gold / red and keeps Leader red, Extra violet", () => {
    const of = (key: SkillDisplay["key"]): SkillDisplay => ({
      key,
      label: key,
      name: key,
      effects: [],
    });
    expect(skillTag(of("leader"), "Leader Skill")).toBe("skill-tag-red");
    expect(skillTag(of("extra"), "Extra Skill")).toBe("skill-tag-violet");
    expect(skillTag(of("bb"), "Brave Burst")).toBe("skill-tag-blue");
    expect(skillTag(of("sbb"), "Super Brave Burst")).toBe("skill-tag-gold");
    expect(skillTag(of("ubb"), "Ultimate Brave Burst")).toBe("skill-tag-red");
    expect(skillTag(null, "Ally Skill")).toBe("skill-tag-blue");
  });

  it("drops the tap-to-open modal when the caller supplies its own press handlers", () => {
    const skill = leaderSkillDisplay({ unitId: "brand", formId: "brand-3" });
    const html = renderToStaticMarkup(createElement(SkillRow, { skill, press: {} }));
    expect(html).not.toContain("<dialog");
  });
});
