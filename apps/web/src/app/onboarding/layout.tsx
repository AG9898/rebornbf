import type { ReactNode } from "react";
import { menuFont } from "../../styles/fonts.ts";

/**
 * Onboarding steps (RESOLVED-68) sit outside the menu frame and share its font. Each step draws its
 * own `OnboardingScreen`.
 */
export default function OnboardingLayout({ children }: { children: ReactNode }): ReactNode {
  return <div className={menuFont.variable}>{children}</div>;
}
