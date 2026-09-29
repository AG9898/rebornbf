import type { ReactNode } from "react";
import { MenuFrame } from "../../components/menu/MenuFrame.tsx";
import { menuFont } from "../../styles/fonts.ts";

/** Every menu page shares the portrait frame; /battle and /gallery sit outside it. */
export default function MenuLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className={menuFont.variable}>
      <MenuFrame>{children}</MenuFrame>
    </div>
  );
}
