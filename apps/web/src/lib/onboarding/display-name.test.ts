import { describe, expect, it } from "vitest";
import {
  DISPLAY_NAME_MAX,
  displayNameLength,
  displayNameProblem,
  initialDisplayName,
  normalizeDisplayName,
} from "./display-name.ts";

describe("displayNameProblem", () => {
  it("accepts 1 to 32 characters after trimming", () => {
    expect(displayNameProblem("A")).toBeNull();
    expect(displayNameProblem("  Summoner  ")).toBeNull();
    expect(displayNameProblem("x".repeat(DISPLAY_NAME_MAX))).toBeNull();
  });

  it("rejects an empty or blank name", () => {
    expect(displayNameProblem("")).toBe("Enter a name.");
    expect(displayNameProblem("   ")).toBe("Enter a name.");
  });

  it("rejects a name over 32 characters", () => {
    expect(displayNameProblem("x".repeat(DISPLAY_NAME_MAX + 1))).toMatch(/at most 32/);
  });

  it("counts characters, not UTF-16 units", () => {
    const emoji = "\u{1F525}".repeat(DISPLAY_NAME_MAX);
    expect(displayNameLength(emoji)).toBe(DISPLAY_NAME_MAX);
    expect(displayNameProblem(emoji)).toBeNull();
  });

  it("rejects control characters", () => {
    expect(displayNameProblem("a\tb")).toMatch(/control/);
    expect(displayNameProblem("a\u0000b")).toMatch(/control/);
    expect(displayNameProblem("a\u007fb")).toMatch(/control/);
  });

  it("trims like the RPC", () => {
    expect(normalizeDisplayName("  Aria ")).toBe("Aria");
  });
});

describe("initialDisplayName", () => {
  it("pre-fills from the OAuth name", () => {
    expect(initialDisplayName("Aden Guo")).toBe("Aden Guo");
  });

  it("is blank without a name", () => {
    expect(initialDisplayName(null)).toBe("");
    expect(initialDisplayName(undefined)).toBe("");
  });

  it("cuts a long OAuth name to a savable one", () => {
    const name = initialDisplayName(`${"y".repeat(40)}`);
    expect(displayNameProblem(name)).toBeNull();
    expect(displayNameLength(name)).toBe(DISPLAY_NAME_MAX);
  });

  it("drops control characters from the OAuth name", () => {
    expect(initialDisplayName("a\nb")).toBe("ab");
  });
});
