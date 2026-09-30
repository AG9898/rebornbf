import { UI_ASSETS, UI_TEXT_BOXES, type UiTextPiece } from "./ui-assets.ts";

/** A rectangle in logical px (or, for `UI_TEXT_BOXES`, in a piece export's 2× px). */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Where a piece's measured text box lands when the piece is drawn over `drawn`: the box scaled by
 * the drawn size over the export size on each axis, so it follows any stretch (ART_GUIDE.md →
 * Text on UI pieces).
 */
export function pieceTextBox(name: UiTextPiece, drawn: Box): Box {
  const piece = UI_ASSETS[name];
  const box = UI_TEXT_BOXES[name];
  const sx = drawn.width / piece.width;
  const sy = drawn.height / piece.height;
  return {
    x: drawn.x + box.x * sx,
    y: drawn.y + box.y * sy,
    width: box.width * sx,
    height: box.height * sy,
  };
}

/**
 * The text box as percentages of the piece, for an absolutely positioned text layer over a menu
 * piece drawn at its own aspect ratio.
 */
export function textBoxStyle(name: UiTextPiece): {
  left: string;
  top: string;
  width: string;
  height: string;
} {
  const piece = UI_ASSETS[name];
  const box = UI_TEXT_BOXES[name];
  const pct = (value: number, of: number) => `${((value / of) * 100).toFixed(3)}%`;
  return {
    left: pct(box.x, piece.width),
    top: pct(box.y, piece.height),
    width: pct(box.width, piece.width),
    height: pct(box.height, piece.height),
  };
}

/** The scale (at most 1) that fits text measured at `size` inside `box`. */
export function fitScale(size: { width: number; height: number }, box: Box): number {
  if (size.width <= 0 || size.height <= 0) return 1;
  return Math.min(1, box.width / size.width, box.height / size.height);
}
