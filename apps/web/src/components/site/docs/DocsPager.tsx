import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./docs.module.css";
import { adjacentPages, docsHref } from "./nav.ts";

const CARD =
  "flex flex-col gap-1 rounded-xl border border-[#2c3450] px-5 py-4 hover:border-[#c9953c]";

/** Previous/next links to the neighbouring written pages in sidebar order. */
export function DocsPager({ slug }: { slug: string }): ReactNode {
  const { previous, next } = adjacentPages(slug);
  if (!previous && !next) {
    return null;
  }
  return (
    <nav aria-label="Previous and next" className="mt-[22px] grid gap-4 sm:grid-cols-2">
      {previous ? (
        <Link href={docsHref(previous.slug)} className={CARD}>
          <span className="text-[13px] font-bold text-[#8e8ba0]">Previous</span>
          <span className={`${styles.display} text-[20px] text-[#fff4d6]`}>{previous.title}</span>
        </Link>
      ) : (
        <span className="hidden sm:block" />
      )}
      {next ? (
        <Link href={docsHref(next.slug)} className={`${CARD} items-end text-right`}>
          <span className="text-[13px] font-bold text-[#8e8ba0]">Next</span>
          <span className={`${styles.display} text-[20px] text-[#fff4d6]`}>{next.title}</span>
        </Link>
      ) : null}
    </nav>
  );
}
