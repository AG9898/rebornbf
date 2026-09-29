import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  OnboardingPanel,
  OnboardingScreen,
} from "../../../components/onboarding/OnboardingScreen.tsx";
import { initialDisplayName } from "../../../lib/onboarding/display-name.ts";
import { onboardingPageRedirect } from "../../../lib/onboarding/routing.ts";
import { getPlayerProfile } from "../../../lib/onboarding/state.ts";
import { NameForm } from "./NameForm.tsx";

export const metadata: Metadata = { title: "Enter your name" };

/**
 * Onboarding name step (RESOLVED-68, GAME_DESIGN §8 New player flow; protected by the proxy). The
 * field starts from the profile's display name, which the profile trigger copied from the OAuth
 * name. Players at another step are sent to it.
 */
export default async function OnboardingNamePage(): Promise<ReactNode> {
  const { state, displayName } = await getPlayerProfile();
  const target = onboardingPageRedirect(state, "name");
  if (target) redirect(target);

  return (
    <OnboardingScreen>
      <OnboardingPanel title="Enter your name" titleId="onboarding-name-title">
        <NameForm initialName={initialDisplayName(displayName)} />
      </OnboardingPanel>
    </OnboardingScreen>
  );
}
