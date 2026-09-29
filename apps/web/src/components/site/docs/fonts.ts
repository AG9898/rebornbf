import { JetBrains_Mono, Nunito_Sans } from "next/font/google";

/**
 * The docs page's type (docs/design/product-site/README.md → Docs page): the game's look, unlike
 * `/product`. Headings use the game's Lilita One (`menuFont`, styles/fonts.ts), body Nunito Sans,
 * formulas JetBrains Mono.
 */
export const docsSans = Nunito_Sans({ subsets: ["latin"], variable: "--font-docs-sans" });

export const docsMono = JetBrains_Mono({
  weight: "500",
  subsets: ["latin"],
  variable: "--font-docs-mono",
});
