import { describe, expect, it } from "vitest";
import { ORIGINAL_ASSETS } from "../../lib/original/original-assets.ts";
import { MENU_EXTRAS, MENU_NEWS, MENU_TILES } from "./menu-screen-data.ts";

const imported = (asset: string): boolean => asset in ORIGINAL_ASSETS;

describe("menu screen", () => {
  it("keeps the original's nine-button grid", () => {
    expect(MENU_TILES.map((t) => t.label)).toEqual([
      "Player Info",
      "Links & Info",
      "Website",
      "Unit Guide",
      "Item Guide",
      "Settings",
      "Help",
      "Credits",
      "Record",
    ]);
  });

  it("uses imported normal and pressed art for every button", () => {
    expect(imported("common/button/main_s_btn1.png")).toBe(true);
    expect(imported("common/button/main_s_btn2.png")).toBe(true);
    for (const t of MENU_TILES) {
      expect(imported(`${t.art}1.png`), t.label).toBe(true);
      expect(imported(`${t.art}2.png`), t.label).toBe(true);
    }
    for (const art of [MENU_NEWS.base, MENU_NEWS.art]) {
      expect(imported(`${art}1.png`), art).toBe(true);
      expect(imported(`${art}2.png`), art).toBe(true);
    }
  });

  it("links live buttons to BFR routes and keeps the BFR extras", () => {
    const live = Object.fromEntries(MENU_TILES.map((t) => [t.label, t.href]));
    expect(live["Player Info"]).toBe("/account");
    expect(live.Settings).toBe("/settings");
    expect(live.Credits).toBeNull();
    expect(MENU_NEWS.href).toBe("/news");
    expect(MENU_EXTRAS.map((e) => e.href)).toContain("/battle");
    expect(MENU_EXTRAS.some((e) => e.href.startsWith("/onboarding/tutorial"))).toBe(true);
  });
});
