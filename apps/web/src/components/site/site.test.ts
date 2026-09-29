import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LAUNCH_UNITS, rosterMeta, SITE_TITLE, SITE_TITLE_PARTS } from "./site.ts";

const publicDir = fileURLToPath(new URL("../../../public", import.meta.url));

describe("product site content", () => {
  it("splits the title into the lead and the italic accent", () => {
    expect(SITE_TITLE_PARTS.lead + SITE_TITLE_PARTS.accent).toBe(SITE_TITLE);
    expect(SITE_TITLE_PARTS.accent).toBe("Reborn");
  });

  it("lists the eight launch units with exported Omni cards and element orbs", () => {
    expect(LAUNCH_UNITS.map((unit) => unit.name)).toEqual([
      "Brand",
      "Maren",
      "Rook",
      "Garrick",
      "Solen",
      "Morrick",
      "Aurelle",
      "Vespera",
    ]);
    for (const unit of LAUNCH_UNITS) {
      expect(existsSync(`${publicDir}${unit.card}`), unit.card).toBe(true);
      expect(existsSync(`${publicDir}${unit.orb}`), unit.orb).toBe(true);
    }
  });

  it("derives the roster meta line from the units", () => {
    expect(rosterMeta(LAUNCH_UNITS)).toBe("8 units · 6 elements · 3★ to Omni");
  });
});
