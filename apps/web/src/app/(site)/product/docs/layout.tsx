import type { ReactNode } from "react";
import { DocsTopBar } from "../../../../components/site/docs/DocsTopBar.tsx";
import { docsMono, docsSans } from "../../../../components/site/docs/fonts.ts";
import { menuFont } from "../../../../styles/fonts.ts";

/**
 * The player docs (RESOLVED-63): the game's look inside the product site, with its own top bar.
 * Pages are MDX files rendered by `[[...slug]]/page.tsx` from the nav config.
 */
export default function DocsLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <div
      className={`${menuFont.variable} ${docsSans.variable} ${docsMono.variable} flex grow flex-col bg-[#0b0f1c] font-(family-name:--font-docs-sans) text-[#e4e1ee]`}
    >
      <DocsTopBar />
      {children}
    </div>
  );
}
