import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AboutSection } from "../../../components/site/AboutSection.tsx";
import { LaunchRoster } from "../../../components/site/LaunchRoster.tsx";
import { ProductBanner } from "../../../components/site/ProductBanner.tsx";
import { SiteFooter } from "../../../components/site/SiteFooter.tsx";
import { SiteNav } from "../../../components/site/SiteNav.tsx";
import { SITE_TITLE } from "../../../components/site/site.ts";

export const metadata: Metadata = {
  title: SITE_TITLE,
  description:
    "A free, non-commercial tribute to Brave Frontier's Omni era: the original battle system with an original cast, in the browser.",
};

/** The public landing page (M7-04A), ported from docs/design/product-site/product.mock.html. */
export default function ProductPage(): ReactNode {
  return (
    <>
      <SiteNav />
      <main>
        <ProductBanner />
        <LaunchRoster />
        <AboutSection />
      </main>
      <SiteFooter />
    </>
  );
}
