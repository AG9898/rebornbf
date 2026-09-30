import { describe, expect, it } from "vitest";
import { fitScale, pieceTextBox, textBoxStyle } from "./text-box.ts";
import { UI_ASSETS, UI_TEXT_BOXES, type UiTextPiece } from "./ui-assets.ts";

const PIECES = Object.keys(UI_TEXT_BOXES) as UiTextPiece[];

describe("UI text boxes", () => {
  it("lie inside their piece exports", () => {
    for (const name of PIECES) {
      const box = UI_TEXT_BOXES[name];
      const piece = UI_ASSETS[name];
      expect(box.x, name).toBeGreaterThanOrEqual(0);
      expect(box.y, name).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, name).toBeLessThanOrEqual(piece.width);
      expect(box.y + box.height, name).toBeLessThanOrEqual(piece.height);
    }
  });

  it("put the burst name in the cut-in ribbon's channel, not on its top rail", () => {
    // The ribbon as battle-scene draws it: 570 wide at y 337, half its export height.
    const drawn = { x: 0, y: 337, width: 570, height: UI_ASSETS["cutin-ribbon-bb"].height / 2 };
    const box = pieceTextBox("cutin-ribbon-bb", drawn);
    expect(box).toEqual({ x: 46, y: 393, width: 344, height: 50 });
    // Clear of the gem cap (to x≈40) and centred on the channel (≈y 418), below the old y 371.
    expect(box.y + box.height / 2).toBe(418);
  });

  it("scales with a stretched piece on each axis", () => {
    const piece = UI_ASSETS["stat-plate"];
    const box = pieceTextBox("stat-plate", {
      x: 10,
      y: 20,
      width: piece.width,
      height: piece.height * 2,
    });
    expect(box).toEqual({ x: 22, y: 40, width: 416, height: 144 });
  });

  it("gives CSS percentages of the piece", () => {
    expect(textBoxStyle("stat-plate")).toEqual({
      left: "2.727%",
      top: "10.870%",
      width: "94.545%",
      height: "78.261%",
    });
  });
});

describe("fitScale", () => {
  const box = { x: 0, y: 0, width: 100, height: 20 };
  it("never enlarges text that already fits", () => {
    expect(fitScale({ width: 50, height: 10 }, box)).toBe(1);
  });
  it("shrinks by the tighter axis", () => {
    expect(fitScale({ width: 200, height: 20 }, box)).toBe(0.5);
    expect(fitScale({ width: 50, height: 40 }, box)).toBe(0.5);
  });
  it("leaves empty text alone", () => {
    expect(fitScale({ width: 0, height: 0 }, box)).toBe(1);
  });
});
