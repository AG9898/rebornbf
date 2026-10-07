import { describe, expect, it } from "vitest";
import { ORIGINAL_ASSETS } from "../../lib/original/original-assets.ts";
import { FRAMES, LABEL_SIZE } from "./kit-data.ts";

describe("original screen kit", () => {
  it("has normal and pressed art for every button base", () => {
    for (const size of Object.keys(LABEL_SIZE)) {
      expect(`common/button/${size}1.png` in ORIGINAL_ASSETS, size).toBe(true);
      expect(`common/button/${size}2.png` in ORIGINAL_ASSETS, size).toBe(true);
    }
  });

  it("has all nine parts of every window frame", () => {
    for (const [name, frame] of Object.entries(FRAMES)) {
      for (const asset of Object.values(frame.parts)) {
        expect(asset in ORIGINAL_ASSETS, `${name}: ${asset}`).toBe(true);
      }
    }
  });

  it("uses the imported title bar, Back button, and ticker pieces", () => {
    for (const asset of [
      "header/header_title_base.png",
      "header/header_title_btn1.png",
      "header/header_title_btn2.png",
      "footer/footer_base/ticker_base.png",
    ]) {
      expect(asset in ORIGINAL_ASSETS, asset).toBe(true);
    }
  });
});
