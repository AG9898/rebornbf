import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { collectionEntries } from "../../lib/units/unit-stacks.ts";
import { UnitPicker } from "./UnitPicker.tsx";

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const entries = collectionEntries(
  [
    { id: id(1), unit_id: "brand", form_id: "brand-3", level: 1, exp: 0 },
    { id: id(2), unit_id: "maren", form_id: "maren-3", level: 1, exp: 0 },
    { id: id(3), unit_id: "rook", form_id: "rook-3", level: 1, exp: 0 },
    { id: id(4), unit_id: "garrick", form_id: "garrick-3", level: 1, exp: 0 },
  ],
  [],
);

function render(): string {
  return renderToStaticMarkup(
    createElement(UnitPicker, {
      title: "Select Units",
      units: entries,
      limit: 5,
      ineligible: [id(4)],
      initialPicks: [
        { id: id(3), copies: 1 },
        { id: id(1), copies: 1 },
        { id: id(4), copies: 1 },
      ],
      backHref: "/units",
      onConfirm: () => {},
    }),
  );
}

describe("UnitPicker markup (M4-06N)", () => {
  const html = render();
  /** The markup of the icon button badged `n`. */
  const icon = (n: number) =>
    html.split("<button").find((button) => button.includes(`, pick ${n}"`));

  it("shows the context title", () => {
    expect(html).toContain("Select Units");
  });

  it("badges picked units in pick order", () => {
    expect(icon(1)).toContain("Rook");
    expect(icon(1)).toContain('data-testid="pick-badge"');
    expect(icon(2)).toContain("Brand");
    expect(html.match(/data-testid="pick-badge"/g)).toHaveLength(2);
  });

  it("ticks the pickable unpicked unit and dims the ineligible one without a pick", () => {
    expect(html.match(/data-testid="pick-tick"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-label="Garrick[^"]*, cannot be picked"[^>]*disabled/);
    expect(html).not.toContain("Garrick, 3★, Lv.1, pick");
    expect(html).toContain("Picked 2/5");
  });
});
