"use client";

import { type ReactNode, useEffect, useState } from "react";
import type { TocEntry } from "./toc.ts";

/** Headings scrolled above this line (below the sticky top bar) count as read. */
const READ_LINE = 120;

/** The "On this page" list; the heading currently being read is highlighted in gold. */
export function DocsToc({ entries }: { entries: readonly TocEntry[] }): ReactNode {
  const [active, setActive] = useState(entries[0]?.id);

  useEffect(() => {
    let frame = 0;
    const update = (): void => {
      frame = 0;
      let current = entries[0]?.id;
      for (const entry of entries) {
        const heading = document.getElementById(entry.id);
        if (heading && heading.getBoundingClientRect().top <= READ_LINE) {
          current = entry.id;
        }
      }
      setActive(current);
    };
    const onScroll = (): void => {
      if (frame === 0) {
        frame = requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [entries]);

  if (entries.length === 0) {
    return null;
  }
  return (
    <nav aria-label="On this page" className="flex flex-col gap-3 text-[14px]">
      <span className="text-[12px] font-extrabold tracking-[0.14em] text-[#8e8ba0] uppercase">
        On this page
      </span>
      {entries.map((entry) => (
        <a
          key={entry.id}
          href={`#${entry.id}`}
          className={`${entry.depth === 3 ? "pl-6" : "pl-3"} ${
            entry.id === active
              ? "font-bold text-[#fff4d6] shadow-[inset_2px_0_0_#e0aa48]"
              : "text-[#a9a6ba] shadow-[inset_2px_0_0_#1f2740] hover:text-[#ffe7ae]"
          }`}
        >
          {entry.text}
        </a>
      ))}
    </nav>
  );
}
