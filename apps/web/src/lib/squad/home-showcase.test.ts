import { describe, expect, it } from "vitest";
import type { OwnedUnitRow } from "../units/owned-units.ts";
import { cardArtPath, HOME_SQUAD_HREF, showcaseCards } from "./home-showcase.ts";

function owned(id: string, unitId: string, formId: string): OwnedUnitRow {
  return { id, unit_id: unitId, form_id: formId, level: 1, exp: 0, unit_type: null };
}

const OWNED: OwnedUnitRow[] = [
  owned("u1", "brand", "brand-3"),
  owned("u2", "maren", "maren-omni"),
  owned("u3", "cinder-sprite", "cinder-sprite-2"),
  owned("u4", "rook", "rook-6"),
];

describe("cardArtPath", () => {
  it("uses the current form's card art", () => {
    expect(cardArtPath("brand", "brand-3")).toBe("/assets/ui/cards/brand-3star.webp");
    expect(cardArtPath("maren", "maren-omni")).toBe("/assets/ui/cards/maren-omni.webp");
  });

  it("is null for forms without card art", () => {
    expect(cardArtPath("cinder-sprite", "cinder-sprite-2")).toBeNull();
    expect(cardArtPath("brand", "brand-2")).toBeNull();
    expect(cardArtPath("brand", "no-such-form")).toBeNull();
    expect(cardArtPath("nobody", "nobody-3")).toBeNull();
  });
});

describe("showcaseCards", () => {
  it("shows five empty frames when there is no squad", () => {
    const cards = showcaseCards(null, OWNED);
    expect(cards).toHaveLength(5);
    expect(cards.every((card) => card.kind === "empty")).toBe(true);
  });

  it("puts the leader first with the badge, then squad order, then empty frames", () => {
    const row = { slot: 0, unit_ids: ["u1", "u2", "u4"], leader_index: 1 };
    expect(showcaseCards(row, OWNED)).toEqual([
      {
        kind: "unit",
        ownedId: "u2",
        name: "Maren",
        element: "water",
        leader: true,
        cardArt: "/assets/ui/cards/maren-omni.webp",
      },
      {
        kind: "unit",
        ownedId: "u1",
        name: "Brand",
        element: "fire",
        leader: false,
        cardArt: "/assets/ui/cards/brand-3star.webp",
      },
      {
        kind: "unit",
        ownedId: "u4",
        name: "Rook",
        element: "thunder",
        leader: false,
        cardArt: "/assets/ui/cards/rook-6star.webp",
      },
      { kind: "empty" },
      { kind: "empty" },
    ]);
  });

  it("drops units the player no longer owns", () => {
    const row = { slot: 0, unit_ids: ["gone", "u3"], leader_index: 0 };
    const cards = showcaseCards(row, OWNED);
    expect(cards[0]).toMatchObject({ kind: "unit", ownedId: "u3", leader: true, cardArt: null });
    expect(cards.slice(1).every((card) => card.kind === "empty")).toBe(true);
  });

  it("links to the squad editor for slot 0", () => {
    expect(HOME_SQUAD_HREF).toBe("/squad?slot=0");
  });
});
