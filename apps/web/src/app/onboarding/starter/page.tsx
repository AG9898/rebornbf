import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { OnboardingScreen } from "../../../components/onboarding/OnboardingScreen.tsx";
import { onboardingPageRedirect } from "../../../lib/onboarding/routing.ts";
import { starterOptions } from "../../../lib/onboarding/starters.ts";
import { getOnboardingState } from "../../../lib/onboarding/state.ts";
import { StarterPicker } from "./StarterPicker.tsx";

export const metadata: Metadata = { title: "Choose your hero" };

/**
 * Onboarding starter step (M3-05A, RESOLVED-68, GAME_DESIGN §8 New player flow; protected by the
 * proxy): the six B0 starters as 3★ showcase cards on the onboarding backdrop. Players at another
 * step are sent to it; a finished player goes home.
 */
export default async function OnboardingStarterPage(): Promise<ReactNode> {
  const target = onboardingPageRedirect(await getOnboardingState(), "starter");
  if (target) redirect(target);

  return (
    <OnboardingScreen>
      <StarterPicker options={starterOptions()} />
    </OnboardingScreen>
  );
}
