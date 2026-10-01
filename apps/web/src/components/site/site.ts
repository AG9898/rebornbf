import { type Element, UnitSchema } from "@bfr/data";
import aurelle from "@bfr/data/content/units/aurelle.json";
import brand from "@bfr/data/content/units/brand.json";
import garrick from "@bfr/data/content/units/garrick.json";
import maren from "@bfr/data/content/units/maren.json";
import morrick from "@bfr/data/content/units/morrick.json";
import rook from "@bfr/data/content/units/rook.json";
import solen from "@bfr/data/content/units/solen.json";
import vespera from "@bfr/data/content/units/vespera.json";
import { ELEMENT_LABELS } from "../../lib/units/owned-units.ts";

/** The public product title (RESOLVED-60). Every `(site)` page reads it from here. */
export const SITE_TITLE = "Brave Frontier: Reborn";

/** The title split before its last word, so the banner can set the last word in italic brass. */
export const SITE_TITLE_PARTS: { lead: string; accent: string } = (() => {
  const at = SITE_TITLE.lastIndexOf(" ");
  return { lead: SITE_TITLE.slice(0, at + 1), accent: SITE_TITLE.slice(at + 1) };
})();

export const SITE_DOMAIN = "rebornbf.com";
export const SOURCE_URL = "https://github.com/AG9898/rebornbf";
export const PLAY_PATH = "/";
export const DOCS_PATH = "/product/docs";

/** A launch unit as the product page shows it: name, element, Omni card, and element orb. */
export type LaunchUnit = {
  id: string;
  name: string;
  element: Element;
  elementLabel: string;
  card: string;
  orb: string;
};

/** The eight launch units in roster order (ROSTER.md), read from `@bfr/data`. */
export const LAUNCH_UNITS: readonly LaunchUnit[] = [
  brand,
  maren,
  rook,
  garrick,
  solen,
  morrick,
  aurelle,
  vespera,
].map((json) => {
  const unit = UnitSchema.parse(json);
  return {
    id: unit.id,
    name: unit.name,
    element: unit.element,
    elementLabel: ELEMENT_LABELS[unit.element],
    card: `/assets/ui/cards/${unit.id}-omni.webp`,
    orb: `/assets/ui/orb-${unit.element}.webp`,
  };
});

/** The roster meta line, derived so it stays true if the launch roster changes. */
export function rosterMeta(units: readonly LaunchUnit[]): string {
  const elements = new Set(units.map((unit) => unit.element)).size;
  return `${units.length} units · ${elements} elements · 3★ to Omni`;
}

/** The four docs link rows on the product page. */
export const DOCS_LINKS: readonly { title: string; blurb: string }[] = [
  { title: "Battle", blurb: "Turns, sparks, crystals, bursts" },
  { title: "Damage", blurb: "The formula, criticals, elements" },
  { title: "Effects", blurb: "Buffs, debuffs, ailments" },
  { title: "Progression", blurb: "Fusion, evolution, imps, spheres" },
];
