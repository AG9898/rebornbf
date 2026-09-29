import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { UI_ASSETS } from "../../menu/ui-assets.ts";
import { DOCS_PATH, PLAY_PATH, SITE_TITLE, SOURCE_URL } from "../site.ts";
import styles from "./docs.module.css";

const CREST = UI_ASSETS["top-crest"];

/** The docs top bar: crest and "Docs", the search box (live at launch), site links, and Play. */
export function DocsTopBar(): ReactNode {
  return (
    <header className="sticky top-0 z-30 border-b border-[#c9953c]/30 bg-[#080b15]">
      <div className="flex h-[68px] items-center gap-4 px-4 sm:gap-7 sm:px-8">
        <Link
          href="/product"
          aria-label={`${SITE_TITLE} home`}
          className="flex shrink-0 items-center gap-2.5"
        >
          <Image
            src="/assets/ui/top-crest.webp"
            alt=""
            width={CREST.width}
            height={CREST.height}
            className="h-9 w-auto"
            preload
          />
          <span className={`${styles.display} ${styles.goldText} text-[26px]`}>BFR</span>
          <span className="border-l border-[#2c3450] pl-2.5 text-[16px] font-bold text-[#a9a6ba]">
            Docs
          </span>
        </Link>
        <label
          title="Search arrives with the full guide at launch"
          className="ml-10 hidden h-10 w-[420px] min-w-0 shrink items-center gap-2.5 rounded-[10px] border border-[#2c3450] bg-[#111729] px-3.5 text-[15px] text-[#8e8ba0] md:flex"
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            disabled
            placeholder="Search coming at launch"
            aria-label="Search the docs (coming at launch)"
            className="min-w-0 grow cursor-not-allowed border-0 bg-transparent text-[#e4e1ee] outline-none placeholder:text-[#8e8ba0]"
          />
          <span className="rounded-md border border-[#2c3450] px-[7px] py-0.5 font-(family-name:--font-docs-mono) text-[12px]">
            Ctrl K
          </span>
        </label>
        <div className="grow" />
        <nav aria-label="Site" className="hidden gap-[26px] text-[15px] font-bold sm:flex">
          <Link href="/product" className="text-[#c9c6d8] hover:text-[#ffe7ae]">
            Product
          </Link>
          <Link href={DOCS_PATH} aria-current="page" className="text-[#fff4d6]">
            Docs
          </Link>
          <a href={SOURCE_URL} className="text-[#c9c6d8] hover:text-[#ffe7ae]">
            Source
          </a>
        </nav>
        <Link
          href={PLAY_PATH}
          className={`${styles.btnGold} ${styles.display} flex h-10 shrink-0 items-center rounded-full px-5 text-[17px]`}
        >
          Play now
        </Link>
      </div>
    </header>
  );
}
