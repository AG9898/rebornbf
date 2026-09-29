import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { DOCS_NAV, docsHref } from "./nav.ts";

const ITEM = "flex items-center gap-2.5 rounded-lg px-3 py-[7px]";

const LAUNCH_TAG = "shrink-0 text-[11px] font-bold tracking-[0.06em] text-[#5b5870] uppercase";

/**
 * The docs section list, drawn from the one nav config. Unwritten entries are not links and are
 * tagged "At launch": once on the group label when the whole group is unwritten, else per item.
 */
export function DocsSidebar({ activeSlug }: { activeSlug: string }): ReactNode {
  return (
    <nav aria-label="Docs sections" className="flex flex-col gap-[22px] text-[15px]">
      {DOCS_NAV.map((group) => {
        const unwritten = group.items.every((item) => item.slug === undefined);
        return (
          <div key={group.label} className="flex flex-col gap-0.5">
            <span className="flex items-baseline justify-between gap-3 px-3 pb-2">
              <span className="text-[12px] font-extrabold tracking-[0.14em] text-[#c9953c] uppercase">
                {group.label}
              </span>
              {unwritten ? <span className={LAUNCH_TAG}>At launch</span> : null}
            </span>
            {group.items.map((item) => {
              const orbs = item.orbs ? (
                <span className="flex shrink-0">
                  {item.orbs.map((element, index) => (
                    <Image
                      key={element}
                      src={`/assets/ui/orb-${element}.webp`}
                      alt=""
                      width={16}
                      height={16}
                      className={`size-4 ${index > 0 ? "-ml-[5px]" : ""}`}
                    />
                  ))}
                </span>
              ) : null;
              if (item.slug === undefined) {
                return (
                  <span
                    key={item.title}
                    aria-disabled="true"
                    className={`${ITEM} justify-between text-[#6f6c82]`}
                  >
                    <span className="flex items-center gap-2.5">
                      {orbs}
                      {item.title}
                    </span>
                    {unwritten ? (
                      <span className="sr-only">(coming at launch)</span>
                    ) : (
                      <span className={LAUNCH_TAG}>At launch</span>
                    )}
                  </span>
                );
              }
              const active = item.slug === activeSlug;
              return (
                <Link
                  key={item.title}
                  href={docsHref(item.slug)}
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? `${ITEM} bg-[#1f1a10] font-extrabold text-[#fff4d6] shadow-[inset_2px_0_0_#e0aa48]`
                      : `${ITEM} text-[#b9b6c9] hover:text-[#ffe7ae]`
                  }
                >
                  {orbs}
                  {item.title}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
