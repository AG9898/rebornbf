import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { MenuFrame } from "../../components/menu/MenuFrame.tsx";
import { onboardingRedirect } from "../../lib/onboarding/routing.ts";
import { getPlayerProfile } from "../../lib/onboarding/state.ts";
import { menuFont } from "../../styles/fonts.ts";

/**
 * Every menu page shares the portrait frame; the title screen, /battle, and /gallery sit outside
 * it. A signed-in player who has not finished onboarding is sent to their next step (RESOLVED-68);
 * nobody is sent back to the title screen. The status bar shows the player's display name and wallet.
 */
export default async function MenuLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactNode> {
  const { state, displayName, wallet } = await getPlayerProfile();
  const target = onboardingRedirect(state);
  if (target) redirect(target);
  return (
    <div className={menuFont.variable}>
      <MenuFrame playerName={displayName} wallet={wallet}>
        {children}
      </MenuFrame>
    </div>
  );
}
