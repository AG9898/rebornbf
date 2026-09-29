import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ArrowIcon } from "./icons.tsx";
import { PLAY_PATH, SITE_TITLE_PARTS } from "./site.ts";

/** The 1024² Omni splashes, placed as in the mock's 940×600 stack (percent of that box). */
const SPLASHES: readonly { src: string; alt: string; style: CSSProperties; back: boolean }[] = [
  {
    src: "/assets/units/maren/illustration-omni.png",
    alt: "",
    style: { left: "0%", top: "11.667%", width: "53.19%" },
    back: true,
  },
  {
    src: "/assets/units/vespera/illustration-omni.png",
    alt: "",
    style: { left: "46.81%", top: "11.667%", width: "53.19%" },
    back: true,
  },
  {
    src: "/assets/units/brand/illustration-omni.png",
    alt: "Brand, Maren, and Vespera in their Omni forms",
    style: { left: "17.02%", top: "1.667%", width: "65.96%" },
    back: false,
  },
];

/** The banner: stacked Omni splashes over the faded plains, the title, and one Play button. */
export function ProductBanner(): ReactNode {
  return (
    <section className="relative flex flex-col items-center border-b border-[#222329] px-4 pb-16 sm:px-8">
      <div
        className="absolute inset-0 bg-cover bg-no-repeat opacity-[0.32]"
        style={{
          backgroundImage: "url(/assets/backgrounds/plains.webp)",
          backgroundPosition: "center 30%",
        }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(14,15,18,0.55)_0%,rgba(14,15,18,0.2)_35%,rgba(14,15,18,0.85)_68%,#0e0f12_82%)]" />

      <div className="relative aspect-[940/600] w-full max-w-[940px] shrink-0">
        {SPLASHES.map((splash) => (
          <Image
            key={splash.src}
            src={splash.src}
            alt={splash.alt}
            width={1024}
            height={1024}
            sizes="(min-width: 940px) 620px, 66vw"
            preload
            className={`absolute h-auto ${splash.back ? "brightness-[0.72] saturate-[0.9]" : ""}`}
            style={splash.style}
          />
        ))}
      </div>

      <h1 className="relative -mt-3 text-center font-(family-name:--font-site-serif) text-[clamp(44px,11vw,104px)] leading-none font-normal tracking-[-0.01em] text-balance">
        {SITE_TITLE_PARTS.lead}
        <em className="text-[#d4b06a]">{SITE_TITLE_PARTS.accent}</em>
      </h1>
      <Link
        href={PLAY_PATH}
        className="relative mt-11 flex h-14 items-center gap-3 rounded-[4px] bg-[#ecebe6] px-9 text-[16px] font-semibold text-[#0e0f12] hover:bg-white"
      >
        Play now
        <ArrowIcon size={16} />
      </Link>
    </section>
  );
}
