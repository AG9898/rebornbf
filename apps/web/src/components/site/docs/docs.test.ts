import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  adjacentPages,
  DOCS_NAV,
  type DocsNavGroup,
  docsHref,
  docsPages,
  docsStem,
} from "./nav.ts";
import { extractToc, slugify } from "./toc.ts";

const contentDir = fileURLToPath(new URL("../../../content/docs", import.meta.url));

describe("docs nav config", () => {
  it("has the sidebar groups in the approved order", () => {
    expect(DOCS_NAV.map((group) => group.label)).toEqual([
      "Getting started",
      "Elements",
      "Battle",
      "Damage",
      "Effects",
      "Enemies and bosses",
      "Progression",
      "Content",
      "Economy",
    ]);
  });

  it("publishes only the intro until launch content is approved (M7-04C–F)", () => {
    expect(docsPages()).toEqual([{ title: "Introduction", slug: "", group: "Getting started" }]);
    expect(docsHref("")).toBe("/product/docs");
  });

  it("has an MDX file for every written page", () => {
    for (const page of docsPages()) {
      expect(existsSync(`${contentDir}/${docsStem(page.slug)}.mdx`), page.title).toBe(true);
    }
  });

  it("links previous and next across groups, skipping unwritten entries", () => {
    const nav: DocsNavGroup[] = [
      { label: "A", items: [{ title: "One", slug: "" }, { title: "Soon" }] },
      { label: "B", items: [{ title: "Two", slug: "b/two" }] },
    ];
    expect(adjacentPages("", nav)).toEqual({
      previous: undefined,
      next: { title: "Two", slug: "b/two", group: "B" },
    });
    expect(adjacentPages("b/two", nav).previous?.title).toBe("One");
    expect(adjacentPages("", DOCS_NAV)).toEqual({ previous: undefined, next: undefined });
  });
});

describe("docs table of contents", () => {
  it("slugifies heading text into anchor ids", () => {
    expect(slugify("Bursts: BB, SBB, UBB")).toBe("bursts-bb-sbb-ubb");
    expect(slugify("  Brave and Heart Crystals ")).toBe("brave-and-heart-crystals");
  });

  it("lists h2 and h3 headings, skipping h1, h4, and fenced code", () => {
    const source = [
      "# Title",
      "## First *part*",
      "### A [linked](/x) `code` bit",
      "#### Too deep",
      "```",
      "## not a heading",
      "```",
      "## Last ##",
    ].join("\n");
    expect(extractToc(source)).toEqual([
      { depth: 2, text: "First part", id: "first-part" },
      { depth: 3, text: "A linked code bit", id: "a-linked-code-bit" },
      { depth: 2, text: "Last", id: "last" },
    ]);
  });

  it("builds the intro page's TOC", () => {
    const intro = readFileSync(`${contentDir}/index.mdx`, "utf8");
    expect(extractToc(intro).map((entry) => entry.text)).toEqual([
      "The guide arrives at launch",
      "Until then",
    ]);
  });
});
