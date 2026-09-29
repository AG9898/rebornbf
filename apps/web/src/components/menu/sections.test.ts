import { describe, expect, it } from "vitest";
import { activeSection, GAME_MODES, NAV_SECTIONS, START_MODE_INDEX } from "./sections.ts";

describe("menu sections", () => {
  it("keeps the original's six nav slots with unique routes", () => {
    expect(NAV_SECTIONS.map((s) => s.label)).toEqual([
      "Home",
      "Unit",
      "Squad",
      "Items",
      "Summon",
      "Other",
    ]);
    expect(new Set(NAV_SECTIONS.map((s) => s.href)).size).toBe(NAV_SECTIONS.length);
  });

  it("marks Home on /home, not on the title screen", () => {
    expect(activeSection("/home")?.label).toBe("Home");
    expect(activeSection("/")).toBeUndefined();
    expect(activeSection("/homex")).toBeUndefined();
    expect(activeSection("/gallery")).toBeUndefined();
  });

  it("marks a section on its own path and nested paths", () => {
    expect(activeSection("/units")?.label).toBe("Unit");
    expect(activeSection("/units/brand")?.label).toBe("Unit");
    expect(activeSection("/unitsx")).toBeUndefined();
  });

  it("opens the carousel on Quest", () => {
    expect(GAME_MODES[START_MODE_INDEX]?.title).toBe("Quest");
  });
});
