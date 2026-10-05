import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LoadingGlyph } from "./LoadingGlyph.tsx";

const css = readFileSync(new URL("./loading-glyph.module.css", import.meta.url), "utf8");

describe("LoadingGlyph (M6-01H)", () => {
  it("inline: the locked glyph and Connecting in code, announced as a status", () => {
    const html = renderToStaticMarkup(createElement(LoadingGlyph));
    expect(html).toContain("/assets/ui/loading-glyph.webp");
    expect(html).toContain("Connecting");
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).not.toContain("data-still");
    expect(html.startsWith("<span")).toBe(true);
  });

  it("screen: one status wrapper around the same glyph", () => {
    const html = renderToStaticMarkup(createElement(LoadingGlyph, { variant: "screen" }));
    expect(html.startsWith("<div")).toBe(true);
    expect(html).toContain("/assets/ui/loading-glyph.webp");
    expect(html.match(/role="status"/g)).toHaveLength(1);
  });

  it("the full-screen variant sits over a darkened Proving Lab circle crop", () => {
    expect(css).toMatch(/\.screen::before\s*\{[^}]*bg-proving-lab\.webp[^}]*brightness\(/);
  });

  it("holds still under the saved setting or OS reduced motion", () => {
    for (const variant of ["inline", "screen"] as const) {
      const html = renderToStaticMarkup(
        createElement(LoadingGlyph, { variant, reducedMotion: true }),
      );
      expect(html).toContain('data-still="true"');
    }
    expect(css).toMatch(
      /\[data-still="true"\] \.art,\s*\[data-still="true"\] \.dots span\s*\{\s*animation: none;/,
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.art,\s*\.dots span\s*\{\s*animation: none;/,
    );
  });
});
