import type { ReactNode } from "react";
import { GitHubIcon } from "./icons.tsx";
import { SITE_DOMAIN, SOURCE_URL } from "./site.ts";

/** The footer: the non-affiliation tribute notice, the domain, and the source link. */
export function SiteFooter(): ReactNode {
  return (
    <footer className="grow border-t border-[#222329] text-[13px] text-[#7d7b73]">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-10 sm:flex-row sm:items-start sm:gap-10 sm:px-8 lg:px-[120px]">
        <p className="m-0 max-w-[620px] leading-[1.6]">
          An unaffiliated, non-commercial fan project. Brave Frontier and its characters, art, and
          trademarks belong to their respective owners.
        </p>
        <div className="hidden grow sm:block" />
        <div className="flex items-center gap-10">
          <a href={`https://${SITE_DOMAIN}`} className="text-[#9a988f] hover:text-[#d4b06a]">
            {SITE_DOMAIN}
          </a>
          <a
            href={SOURCE_URL}
            aria-label="Source code on GitHub"
            className="flex text-[#9a988f] hover:text-[#d4b06a]"
          >
            <GitHubIcon size={18} />
          </a>
        </div>
      </div>
    </footer>
  );
}
