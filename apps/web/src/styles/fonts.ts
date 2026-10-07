import { Lilita_One } from "next/font/google";

/**
 * Lilita One (legacy/ART_GUIDE_BFR.md → UI → Typography), defined once so the menu frame and the battle
 * canvas share one self-hosted font. The menu uses its `variable`; the battle passes
 * `style.fontFamily` to Phaser once `document.fonts` has loaded it (`PhaserBattle.tsx`).
 */
export const menuFont = Lilita_One({ weight: "400", subsets: ["latin"], variable: "--font-menu" });
