import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { MenuFrame } from "../../components/menu/MenuFrame.tsx";
import { onboardingRedirect } from "../../lib/onboarding/routing.ts";
import { getPlayerProfile } from "../../lib/onboarding/state.ts";
import { menuFont } from "../../styles/fonts.ts";

/**
 * Every menu page shares the portrait frame; the title screen and /battle sit outside it. A
 * signed-in player who has not finished onboarding is sent to their next step (RESOLVED-68);
 * nobody is sent back to the title screen. The status bar shows the player's display name and
 * wallet; menu audio plays at their saved volumes (M7-01_4).
 */
export default async function MenuLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactNode> {
  const { state, displayName, wallet, volume } = await getPlayerProfile();
  const target = onboardingRedirect(state);
  if (target) redirect(target);
  return (
    <div className={menuFont.variable}>
      <MenuFrame playerName={displayName} wallet={wallet} volume={volume}>
        {children}
      </MenuFrame>
    </div>
  );
}
