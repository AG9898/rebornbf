import { describe, expect, it } from "vitest";
import { ENGINE_VERSION } from "./index.ts";

describe("@bfr/engine", () => {
  it("imports @bfr/data by package name", () => {
    expect(ENGINE_VERSION).toBe("0.0.0+data12");
  });
});
