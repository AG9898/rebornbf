import Image from "next/image";
import type { ReactNode } from "react";
import { CARD_ART_SIZE } from "../menu/ui-assets.ts";
import { LAUNCH_UNITS, rosterMeta } from "./site.ts";

/** The launch roster: the eight Omni showcase cards with name and element. */
export function LaunchRoster(): ReactNode {
  return (
    <section id="roster" className="scroll-mt-4 border-b border-[#222329]">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-10 px-4 pt-16 pb-[72px] sm:px-8 lg:px-[120px] lg:pt-24 lg:pb-[104px]">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
          <h2 className="font-(family-name:--font-site-serif) text-[40px] leading-none font-normal sm:text-[48px]">
            Launch roster
          </h2>
          <span className="font-(family-name:--font-site-mono) text-[12px] tracking-[0.1em] text-[#7d7b73] uppercase">
            {rosterMeta(LAUNCH_UNITS)}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-3 lg:grid-cols-8 lg:gap-4">
          {LAUNCH_UNITS.map((unit) => (
            <figure key={unit.id} className="m-0 flex min-w-0 flex-col gap-3.5">
              <div className="relative aspect-[250/690] overflow-hidden rounded-[6px] border border-[#2a2b31] bg-[#16171b]">
                <Image
                  src={unit.card}
                  alt={unit.name}
                  width={CARD_ART_SIZE.width}
                  height={CARD_ART_SIZE.height}
                  sizes="(min-width: 1024px) 150px, 25vw"
                  className="block size-full object-cover"
                />
              </div>
              <figcaption className="flex flex-col gap-1">
                <span className="truncate text-[14px] font-medium sm:text-[16px]">{unit.name}</span>
                <span className="flex items-center gap-[7px] text-[12px] text-[#9a988f] sm:text-[13px]">
                  <Image
                    src={unit.orb}
                    alt=""
                    width={88}
                    height={88}
                    className="size-3.5 shrink-0"
                  />
                  {unit.elementLabel}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
