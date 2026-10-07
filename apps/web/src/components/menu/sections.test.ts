import { describe, expect, it } from "vitest";
import { ORIGINAL_ASSETS } from "../../lib/original/original-assets.ts";
import {
  activeSection,
  GAME_MODES,
  NAV_SECTIONS,
  SHORTCUTS,
  SIDE_BUTTONS_LEFT,
  SIDE_BUTTONS_RIGHT,
  START_MODE_INDEX,
} from "./sections.ts";

const imported = (asset: string): boolean => asset in ORIGINAL_ASSETS;

describe("menu sections", () => {
  it("keeps the original's six footer buttons in order", () => {
    expect(NAV_SECTIONS.map((s) => s.label)).toEqual([
      "Home",
      "Unit",
      "Town",
      "Shop",
      "Summon",
      "Social",
    ]);
    const routes = NAV_SECTIONS.flatMap((s) => (s.href ? [s.href] : []));
    expect(new Set(routes).size).toBe(routes.length);
  });

  it("uses imported art for every footer state, side button, shortcut, and mode", () => {
    for (const s of NAV_SECTIONS) {
      expect(imported(`footer/footer_btn/btn_${s.button}_01.png`), s.label).toBe(true);
      expect(imported(`footer/footer_btn/btn_${s.button}_02.png`), s.label).toBe(true);
    }
    for (const b of [...SIDE_BUTTONS_LEFT, ...SIDE_BUTTONS_RIGHT]) {
      expect(imported(`home/home_new_btn_${b.art}1.png`), b.label).toBe(true);
      expect(imported(`home/home_new_btn_${b.art}2.png`), b.label).toBe(true);
    }
    for (const s of SHORTCUTS) expect(s.art.every(imported), s.label).toBe(true);
    for (const m of GAME_MODES) expect(imported(m.art), m.title).toBe(true);
  });

  it("marks Home on /home, not on the title screen", () => {
    expect(activeSection("/home")?.label).toBe("Home");
    expect(activeSection("/")).toBeUndefined();
    expect(activeSection("/homex")).toBeUndefined();
  });

  it("marks a section on its own path, nested paths, and the routes it owns", () => {
    expect(activeSection("/units")?.label).toBe("Unit");
    expect(activeSection("/units/brand")?.label).toBe("Unit");
    expect(activeSection("/units/list")?.label).toBe("Unit"); // M4-06B: All Units under the hub
    expect(activeSection("/squad")?.label).toBe("Unit");
    expect(activeSection("/fusion")?.label).toBe("Unit");
    expect(activeSection("/items")?.label).toBe("Town");
    expect(activeSection("/unitsx")).toBeUndefined();
  });

  it("opens the carousel on Quest, with Trial reachable from the shortcuts", () => {
    expect(GAME_MODES[START_MODE_INDEX]?.title).toBe("Quest");
    expect(SHORTCUTS.find((s) => s.label === "Trial")?.href).toBe("/conclave");
  });
});
