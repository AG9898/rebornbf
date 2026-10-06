import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UI_ASSETS } from "../menu/ui-assets.ts";
import { LoadingGlyph } from "./LoadingGlyph.tsx";
import { type LinkClick, startsNavigation } from "./nav-pending.ts";

const css = readFileSync(new URL("./loading-glyph.module.css", import.meta.url), "utf8");

describe("LoadingGlyph (M6-01H)", () => {
  it("inline: the runner and Connecting in code, announced as a status", () => {
    const html = renderToStaticMarkup(createElement(LoadingGlyph));
    expect(html).toContain("Connecting");
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).not.toContain("data-still");
    expect(html.startsWith("<span")).toBe(true);
  });

  it("screen: one status wrapper around the same runner", () => {
    const html = renderToStaticMarkup(createElement(LoadingGlyph, { variant: "screen" }));
    expect(html.startsWith("<div")).toBe(true);
    expect(html).toContain("Connecting");
    expect(html.match(/role="status"/g)).toHaveLength(1);
  });

  it("the runner steps through the six 165x128 frames of loading-run", () => {
    expect(UI_ASSETS["loading-run"]).toEqual({ width: 6 * 165, height: 128 });
    expect(css).toMatch(/\.runner\s*\{[^}]*loading-run\.webp[^}]*600% 100%/);
    expect(css).toMatch(/\.runner\s*\{[^}]*aspect-ratio: 165 \/ 128;/);
    expect(css).toMatch(/animation: run 0\.75s steps\(6\) infinite;/);
    expect(css).toMatch(/@keyframes run\s*\{\s*to\s*\{\s*background-position-x: 120%;/);
  });

  it("the full-screen variant dims the current screen without replacing it", () => {
    expect(css).toMatch(/\.screen\s*\{[^}]*background: rgb\(0 0 0 \/ 0\.7\);/);
    expect(css).not.toContain("::before");
  });

  it("holds still under the saved setting or OS reduced motion", () => {
    for (const variant of ["inline", "screen"] as const) {
      const html = renderToStaticMarkup(
        createElement(LoadingGlyph, { variant, reducedMotion: true }),
      );
      expect(html).toContain('data-still="true"');
    }
    expect(css).toMatch(
      /\[data-still="true"\] \.runner,\s*\[data-still="true"\] \.dots span\s*\{\s*animation: none;/,
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.runner,\s*\.dots span\s*\{\s*animation: none;/,
    );
  });
});

describe("startsNavigation (menu route-load overlay)", () => {
  const here = { origin: "https://rebornbf.com", pathname: "/home" };
  const click = (patch: Partial<LinkClick>): LinkClick => ({
    href: "https://rebornbf.com/quests",
    target: null,
    download: false,
    button: 0,
    modified: false,
    ...patch,
  });

  it("covers a plain left click on an in-app link to another path", () => {
    expect(startsNavigation(click({}), here)).toBe(true);
    expect(startsNavigation(click({ target: "_self" }), here)).toBe(true);
  });

  it("ignores non-links, same-path links, and other origins", () => {
    expect(startsNavigation(click({ href: null }), here)).toBe(false);
    expect(startsNavigation(click({ href: "https://rebornbf.com/home?tab=2" }), here)).toBe(false);
    expect(startsNavigation(click({ href: "https://rebornbf.com/home#news" }), here)).toBe(false);
    expect(startsNavigation(click({ href: "https://discord.com/x" }), here)).toBe(false);
  });

  it("ignores new tabs, downloads, and modified or non-primary clicks", () => {
    expect(startsNavigation(click({ target: "_blank" }), here)).toBe(false);
    expect(startsNavigation(click({ download: true }), here)).toBe(false);
    expect(startsNavigation(click({ modified: true }), here)).toBe(false);
    expect(startsNavigation(click({ button: 1 }), here)).toBe(false);
  });
});
