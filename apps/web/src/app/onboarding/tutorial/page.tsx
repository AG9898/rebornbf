import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { onboardingPageRedirect } from "../../../lib/onboarding/routing.ts";
import { getOnboardingState } from "../../../lib/onboarding/state.ts";
import { TutorialClient } from "./TutorialClient.tsx";

export const metadata: Metadata = { title: "Tutorial" };

/**
 * Onboarding tutorial step (RESOLVED-68, GAME_DESIGN §8 New player flow; protected by the proxy).
 * The tutorial battle runs client-side with step-by-step prompts; skipping or winning calls
 * `finish_tutorial` and continues to the starter pick. With `?replay=1` (linked from `/other`) it
 * shows at any step and ends back at `/other` without touching onboarding progress; it grants
 * nothing either way.
 */
export default async function OnboardingTutorialPage({
  searchParams,
}: {
  searchParams: Promise<{ replay?: string | string[] }>;
}): Promise<ReactNode> {
  const { replay } = await searchParams;
  const replaying = replay === "1";
  if (!replaying) {
    const target = onboardingPageRedirect(await getOnboardingState(), "tutorial");
    if (target) redirect(target);
  }
  return <TutorialClient replay={replaying} />;
}
