import { describe, expect, it } from "vitest";
import { DATA_SCHEMA_VERSION } from "./index.ts";

describe("@bfr/data", () => {
  it("exports the content schema version", () => {
    expect(DATA_SCHEMA_VERSION).toBe(6);
  });
});
