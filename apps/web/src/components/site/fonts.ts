import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";

/**
 * The product site's type (docs/design/product-site/README.md): Instrument Serif for headings,
 * Geist for body, Geist Mono for labels. Deliberately not the game's Lilita One.
 */
export const siteSerif = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-site-serif",
});

export const siteSans = Geist({ subsets: ["latin"], variable: "--font-site-sans" });

export const siteMono = Geist_Mono({ subsets: ["latin"], variable: "--font-site-mono" });
