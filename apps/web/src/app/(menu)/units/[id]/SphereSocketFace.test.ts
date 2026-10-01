import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sphereIcon } from "./SphereSocketFace.tsx";

const spheresDir = join(import.meta.dirname, "../../../../../../../packages/data/content/spheres");

describe("sphere icons (M6-10A)", () => {
  it("has an exported icon for every launch sphere", () => {
    const ids = readdirSync(spheresDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""));
    expect(ids.length).toBe(10);
    for (const id of ids) expect(sphereIcon(id), id).toBe(`sphere-${id}`);
  });

  it("falls back for a sphere without an icon", () => {
    expect(sphereIcon("no-such-sphere")).toBeNull();
  });
});
