import type { ReactNode } from "react";
import { siteMono, siteSans, siteSerif } from "../../components/site/fonts.ts";

/**
 * The public product site (RESOLVED-60): a normal scrolling site layout outside the portrait
 * menu frame, in the mock's own type and colours (docs/design/product-site/).
 */
export default function SiteLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <div
      className={`${siteSerif.variable} ${siteSans.variable} ${siteMono.variable} flex min-h-dvh flex-col bg-[#0e0f12] font-(family-name:--font-site-sans) text-[#ecebe6]`}
    >
      {children}
    </div>
  );
}
