import { describe, expect, it } from "vitest";
import {
  formatCount,
  memberSinceLabel,
  SIGN_IN_HERO_IDS,
  sessionProvider,
  signInHeroes,
  totalUnits,
} from "./account-view.ts";

describe("signInHeroes", () => {
  it("lists the six starters at Omni, one per element", () => {
    const heroes = signInHeroes();
    expect(heroes.map((h) => h.unitId)).toEqual([...SIGN_IN_HERO_IDS]);
    expect(new Set(heroes.map((h) => h.element)).size).toBe(6);
    expect(heroes[2]).toMatchObject({
      name: "Brand",
      element: "fire",
      cardArt: "/assets/ui/cards/brand-omni.webp",
    });
  });
});

describe("sessionProvider", () => {
  it("reads a supported provider from app_metadata", () => {
    expect(sessionProvider({ app_metadata: { provider: "discord" } })).toBe("discord");
    expect(sessionProvider({ app_metadata: { provider: "google" } })).toBe("google");
  });

  it("is null for missing or unsupported providers", () => {
    expect(sessionProvider(null)).toBeNull();
    expect(sessionProvider({})).toBeNull();
    expect(sessionProvider({ app_metadata: { provider: "email" } })).toBeNull();
  });
});

describe("memberSinceLabel", () => {
  it("formats the UTC date", () => {
    expect(memberSinceLabel("2026-10-06T23:30:00Z")).toBe("Oct 6, 2026");
  });

  it("is null for missing or bad timestamps", () => {
    expect(memberSinceLabel(null)).toBeNull();
    expect(memberSinceLabel("not a date")).toBeNull();
  });
});

describe("totalUnits", () => {
  it("adds stack copies to unit rows, ignoring negative counts", () => {
    expect(totalUnits(12, [5, 0, 99])).toBe(116);
    expect(totalUnits(3, [-2])).toBe(3);
  });
});

describe("formatCount", () => {
  it("adds thousands separators", () => {
    expect(formatCount(1234567)).toBe("1,234,567");
  });
});
