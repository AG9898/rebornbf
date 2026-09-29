import { describe, expect, it } from "vitest";
import {
  HOME_PATH,
  isOnboardingStep,
  ONBOARDING_PATHS,
  onboardingPageRedirect,
  onboardingRedirect,
  TITLE_SIGN_IN_PATH,
  titleTapDestination,
} from "./routing.ts";

describe("title tap destination", () => {
  it("sends a signed-out visitor to sign-in, continuing to home", () => {
    expect(titleTapDestination({ signedIn: false })).toBe(TITLE_SIGN_IN_PATH);
    expect(TITLE_SIGN_IN_PATH).toBe("/sign-in?next=%2Fhome");
  });

  it("sends an unfinished player to their next onboarding step", () => {
    expect(titleTapDestination({ signedIn: true, step: "name" })).toBe("/onboarding/name");
    expect(titleTapDestination({ signedIn: true, step: "tutorial" })).toBe("/onboarding/tutorial");
    expect(titleTapDestination({ signedIn: true, step: "starter" })).toBe("/onboarding/starter");
  });

  it("sends a finished player home", () => {
    expect(titleTapDestination({ signedIn: true, step: "done" })).toBe(HOME_PATH);
  });

  it("sends a player whose step could not be read home", () => {
    expect(titleTapDestination({ signedIn: true, step: null })).toBe(HOME_PATH);
  });
});

describe("menu page onboarding redirect", () => {
  it("never redirects a signed-out visitor or a finished player", () => {
    expect(onboardingRedirect({ signedIn: false })).toBeNull();
    expect(onboardingRedirect({ signedIn: true, step: "done" })).toBeNull();
    expect(onboardingRedirect({ signedIn: true, step: null })).toBeNull();
  });

  it("sends an unfinished player to their onboarding step", () => {
    for (const [step, path] of Object.entries(ONBOARDING_PATHS)) {
      expect(isOnboardingStep(step)).toBe(true);
      expect(
        onboardingRedirect({ signedIn: true, step: step as keyof typeof ONBOARDING_PATHS }),
      ).toBe(path);
    }
  });

  it("never redirects to the title screen", () => {
    for (const path of Object.values(ONBOARDING_PATHS)) expect(path).not.toBe("/");
  });
});

describe("isOnboardingStep", () => {
  it("accepts only the four enum values", () => {
    expect(isOnboardingStep("done")).toBe(true);
    expect(isOnboardingStep("home")).toBe(false);
    expect(isOnboardingStep(null)).toBe(false);
  });
});

describe("onboarding page redirect", () => {
  it("shows the page at its own step", () => {
    expect(onboardingPageRedirect({ signedIn: true, step: "name" }, "name")).toBeNull();
    expect(onboardingPageRedirect({ signedIn: true, step: "tutorial" }, "tutorial")).toBeNull();
  });

  it("sends a player at another step to that step's page", () => {
    expect(onboardingPageRedirect({ signedIn: true, step: "tutorial" }, "name")).toBe(
      "/onboarding/tutorial",
    );
    expect(onboardingPageRedirect({ signedIn: true, step: "name" }, "starter")).toBe(
      "/onboarding/name",
    );
  });

  it("sends a finished player home", () => {
    expect(onboardingPageRedirect({ signedIn: true, step: "done" }, "name")).toBe(HOME_PATH);
  });

  it("sends a signed-out visitor to sign-in, returning to the page", () => {
    expect(onboardingPageRedirect({ signedIn: false }, "name")).toBe(
      "/sign-in?next=%2Fonboarding%2Fname",
    );
  });

  it("shows the page when the step could not be read", () => {
    expect(onboardingPageRedirect({ signedIn: true, step: null }, "name")).toBeNull();
  });
});
