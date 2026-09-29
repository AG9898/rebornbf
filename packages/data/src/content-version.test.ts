import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  contentVersion,
  loadContent,
  renderSeedSql,
  renderVersionModule,
  seedSqlPath,
  versionModulePath,
} from "../scripts/content-seed.ts";
import { CONTENT_VERSION } from "./index.ts";

describe("content seed (M3-02)", () => {
  const items = loadContent();
  const version = contentVersion(items);

  it("CONTENT_VERSION matches the current content", () => {
    expect(CONTENT_VERSION).toBe(version);
    expect(readFileSync(versionModulePath, "utf8")).toBe(renderVersionModule(version));
  });

  it("supabase/seed.sql is up to date (run `pnpm --filter @bfr/data seed`)", () => {
    expect(readFileSync(seedSqlPath, "utf8")).toBe(renderSeedSql(items, version));
  });

  it("covers every unit, item, enemy, stage, and banner file", () => {
    const kinds = new Set(items.map((item) => item.kind));
    expect([...kinds].sort()).toEqual(["banner", "enemy", "item", "stage", "unit"]);
    expect(items.find((item) => item.kind === "unit" && item.id === "brand")).toBeDefined();
    expect(items.find((item) => item.kind === "item" && item.id === "crown-shard")).toBeDefined();
    expect(
      items.find((item) => item.kind === "banner" && item.id === "launch-summon"),
    ).toBeDefined();
  });

  it("the version changes when any content changes", () => {
    const edited = items.map((item, i) => (i === 0 ? { ...item, data: { edited: true } } : item));
    expect(contentVersion(edited)).not.toBe(version);
    expect(contentVersion(items)).toBe(version);
  });
});
