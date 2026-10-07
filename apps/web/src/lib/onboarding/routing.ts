import { SIGN_IN_PATH } from "../supabase/routes.ts";

/**
 * Title screen and onboarding routing (RESOLVED-68, GAME_DESIGN §8 New player flow). The server
 * owns `profiles.onboarding_step` (M3-06A); these pure helpers decide where the player goes from it.
 */

export const TITLE_PATH = "/";
export const HOME_PATH = "/home";

export const ONBOARDING_STEPS = ["name", "starter", "done"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** The page for each unfinished onboarding step. */
export const ONBOARDING_PATHS: Readonly<Record<Exclude<OnboardingStep, "done">, string>> = {
  name: "/onboarding/name",
  starter: "/onboarding/starter",
};

export function isOnboardingStep(value: unknown): value is OnboardingStep {
  return typeof value === "string" && (ONBOARDING_STEPS as readonly string[]).includes(value);
}

/**
 * The player as the title screen and menu pages see them: signed out, or signed in at a step.
 * A signed-in player whose profile could not be read has `step: null`.
 */
export type OnboardingState = { signedIn: false } | { signedIn: true; step: OnboardingStep | null };

/** After sign-in from the title screen the player lands on home, which forwards to onboarding. */
export const TITLE_SIGN_IN_PATH = `${SIGN_IN_PATH}?${new URLSearchParams({ next: HOME_PATH }).toString()}`;

/** Where "Tap to start" goes: sign-in, the next unfinished onboarding step, or home. */
export function titleTapDestination(state: OnboardingState): string {
  if (!state.signedIn) return TITLE_SIGN_IN_PATH;
  return onboardingRedirect(state) ?? HOME_PATH;
}

/**
 * The onboarding page a menu page must send this player to, or null to stay. Signed-out visitors
 * and finished players stay (protected pages are handled by the proxy), as does a player whose
 * step could not be read: menu pages never bounce anyone back to the title screen.
 */
export function onboardingRedirect(state: OnboardingState): string | null {
  if (!state.signedIn || state.step === null || state.step === "done") return null;
  return ONBOARDING_PATHS[state.step];
}

/**
 * Where an onboarding page must send this player, or null to show the page. Each page shows only
 * at its own step: an earlier or later step goes to that step's page, and a finished player goes
 * home. Signed-out visitors go to sign-in (the proxy normally catches them first); a player whose
 * step could not be read stays, so a read failure never loops.
 */
export function onboardingPageRedirect(
  state: OnboardingState,
  page: Exclude<OnboardingStep, "done">,
): string | null {
  if (!state.signedIn) {
    const params = new URLSearchParams({ next: ONBOARDING_PATHS[page] });
    return `${SIGN_IN_PATH}?${params.toString()}`;
  }
  if (state.step === null || state.step === page) return null;
  return onboardingRedirect(state) ?? HOME_PATH;
}
