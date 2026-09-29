import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { UI_ASSETS } from "../menu/ui-assets.ts";
import { ArrowIcon, GitHubIcon } from "./icons.tsx";
import { DOCS_PATH, PLAY_PATH, SITE_TITLE, SOURCE_URL } from "./site.ts";

const CREST = UI_ASSETS["top-crest"];

/** The product site's top bar: crest home link, section links, source link, and Play. */
export function SiteNav(): ReactNode {
  return (
    <header className="relative z-10 border-b border-[#222329]">
      <div className="mx-auto flex h-[72px] max-w-[1440px] items-center gap-3 px-4 sm:gap-10 sm:px-8 lg:px-[120px]">
        <Link
          href="/product"
          aria-label={`${SITE_TITLE} home`}
          className="flex shrink-0 items-center"
        >
          <Image
            src="/assets/ui/top-crest.webp"
            alt=""
            width={CREST.width}
            height={CREST.height}
            className="h-9 w-auto sm:h-11"
            preload
          />
        </Link>
        <div className="grow" />
        <nav aria-label="Primary" className="flex gap-4 text-[14px] sm:gap-9 sm:text-[15px]">
          <a href="#roster" className="text-[#b3b1a8] hover:text-[#d4b06a]">
            Roster
          </a>
          <a href="#about" className="text-[#b3b1a8] hover:text-[#d4b06a]">
            About
          </a>
          <Link href={DOCS_PATH} className="text-[#b3b1a8] hover:text-[#d4b06a]">
            Docs
          </Link>
        </nav>
        <a
          href={SOURCE_URL}
          aria-label="Source code on GitHub"
          className="hidden size-[38px] items-center justify-center text-[#b3b1a8] hover:text-[#d4b06a] sm:flex"
        >
          <GitHubIcon size={22} />
        </a>
        <Link
          href={PLAY_PATH}
          className="flex h-[38px] shrink-0 items-center gap-2.5 rounded-[4px] border border-[#4a4b52] px-3.5 text-[14px] font-medium hover:text-[#d4b06a] sm:px-[18px]"
        >
          Play
          <ArrowIcon size={14} />
        </Link>
      </div>
    </header>
  );
}
