import { describe, expect, it } from "vitest";
import {
  DEFAULT_AFTER_SIGN_IN,
  isOAuthProvider,
  isProtectedPath,
  safeNextPath,
  signInRedirectPath,
} from "./routes.ts";

describe("isProtectedPath", () => {
  it("protects the account page and its subpaths", () => {
    expect(isProtectedPath("/account")).toBe(true);
    expect(isProtectedPath("/account/settings")).toBe(true);
  });

  it("protects the unit collection and unit detail pages", () => {
    expect(isProtectedPath("/units")).toBe(true);
    expect(isProtectedPath("/units/list")).toBe(true);
    expect(isProtectedPath("/units/3f1c2b1e-9a4d-4c55-8e7a-1b2c3d4e5f60")).toBe(true);
  });

  it("protects the summon screen", () => {
    expect(isProtectedPath("/summon")).toBe(true);
  });

  it("protects the squad editor", () => {
    expect(isProtectedPath("/squad")).toBe(true);
    expect(isProtectedPath("/onboarding/name")).toBe(true);
    expect(isProtectedPath("/settings")).toBe(true);
  });

  it("protects the Conclave and Proving Lab (M6-01G)", () => {
    expect(isProtectedPath("/conclave")).toBe(true);
    expect(isProtectedPath("/conclave/lab")).toBe(true);
    expect(isProtectedPath("/conclaves")).toBe(false);
  });

  it("protects Reinforcement and Begin Quest without matching unrelated prefixes", () => {
    expect(isProtectedPath("/start/story-01")).toBe(true);
    expect(isProtectedPath("/start/story-01/begin")).toBe(true);
    expect(isProtectedPath("/starter")).toBe(false);
  });

  it("protects the owner tools", () => {
    expect(isProtectedPath("/owner/faces")).toBe(true);
    expect(isProtectedPath("/owners")).toBe(false);
  });

  it("leaves public pages open", () => {
    for (const path of [
      "/",
      "/battle",
      "/sign-in",
      "/auth/callback",
      "/accounts",
      "/accountx",
      "/unitsx",
      "/squads",
    ]) {
      expect(isProtectedPath(path)).toBe(false);
    }
  });
});

describe("safeNextPath", () => {
  it("keeps same-origin paths with their query", () => {
    expect(safeNextPath("/account?tab=1")).toBe("/account?tab=1");
    expect(safeNextPath("/battle")).toBe("/battle");
  });

  it("rejects missing, absolute, protocol-relative, and backslash targets", () => {
    for (const next of [null, undefined, "", "https://evil.test", "//evil.test", "/\\evil.test"]) {
      expect(safeNextPath(next)).toBe(DEFAULT_AFTER_SIGN_IN);
    }
  });

  it("does not loop back to the sign-in page", () => {
    expect(safeNextPath("/sign-in")).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeNextPath("/sign-in?next=/account")).toBe(DEFAULT_AFTER_SIGN_IN);
  });
});

describe("signInRedirectPath", () => {
  it("carries the requested path and query as an encoded next parameter", () => {
    expect(signInRedirectPath("/account", "?tab=1")).toBe("/sign-in?next=%2Faccount%3Ftab%3D1");
  });
});

describe("isOAuthProvider", () => {
  it("accepts only Google and Discord", () => {
    expect(isOAuthProvider("google")).toBe(true);
    expect(isOAuthProvider("discord")).toBe(true);
    expect(isOAuthProvider("github")).toBe(false);
    expect(isOAuthProvider(null)).toBe(false);
  });
});
