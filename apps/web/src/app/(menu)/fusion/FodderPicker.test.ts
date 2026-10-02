import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { OwnedUnitRow } from "../../../lib/units/owned-units.ts";
import { collectionEntries, type UnitStackRow } from "../../../lib/units/unit-stacks.ts";
import { FodderPicker } from "./FodderPicker.tsx";

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const flaskStack = "10000000-0000-4000-8000-000000000001";
const rows: OwnedUnitRow[] = [
  { id: id(1), unit_id: "brand", form_id: "brand-3", level: 1, exp: 0, bb_level: 10 },
  { id: id(2), unit_id: "maren", form_id: "maren-3", level: 1, exp: 0 },
  { id: id(3), unit_id: "rook", form_id: "rook-3", level: 1, exp: 0 },
];
const stacks: UnitStackRow[] = [
  { id: flaskStack, unit_id: "cinder-flask", form_id: "cinder-flask-3", count: 60 },
];
const entries = collectionEntries(rows, stacks);

function render(copies: number): string {
  return renderToStaticMarkup(
    createElement(FodderPicker, {
      entries,
      rows,
      stacks,
      blocked: [id(3)],
      initialDraft: {
        targetId: id(1),
        slots: [
          { kind: "stack", id: flaskStack, copies },
          { kind: "row", id: id(2), copies: 1 },
        ],
      },
      onBack: () => {},
      onConfirm: () => {},
    }),
  );
}

describe("fusion fodder picker markup (M4-01F)", () => {
  const html = render(20);
  const tile = (name: string) =>
    html.split("<button").find((button) => button.includes(`aria-label="${name}`));

  it("shows five slots: filled ones with ×N and a minus badge, then empty ones", () => {
    expect(html.match(/data-testid="fodder-slot"/g)).toHaveLength(2);
    expect(html.match(/data-empty=""/g)).toHaveLength(3);
    expect(html).toContain("×20");
    expect(html).toContain("One fewer Cinder Flask (×20)");
    expect(html).toContain("One fewer Maren (×1)");
    expect(html).toContain("Remove All");
  });

  it("has no per-icon stepper and leaves the base out of the grid", () => {
    expect(html).not.toContain("One more");
    expect(html).not.toContain("/60");
    expect(html).not.toMatch(/aria-label="Brand/);
  });

  it("badges placed tiles, shows a stack's unplaced copies, and dims what adds nothing", () => {
    expect(tile("Cinder Flask")).toContain("slot 1");
    expect(tile("Cinder Flask")).toContain("40 copies");
    expect(tile("Cinder Flask")).not.toContain("aria-disabled");
    // A placed row cannot add a second copy; a squad member is protected.
    expect(tile("Maren")).toContain('aria-disabled="true"');
    expect(tile("Rook")).toContain('aria-disabled="true"');
  });

  it("dims the stack once the no-wasted-pick cutoff is reached (44 flasks from Lv.1)", () => {
    expect(render(44)).toMatch(
      /aria-label="Cinder Flask[^"]*nothing to add"[^>]*aria-disabled="true"/,
    );
    expect(render(43)).not.toMatch(/aria-label="Cinder Flask[^"]*nothing to add"/);
  });
});
