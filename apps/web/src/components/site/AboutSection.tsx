import Link from "next/link";
import type { ReactNode } from "react";
import { DOCS_LINKS, DOCS_PATH } from "./site.ts";

const LABEL =
  "m-0 shrink-0 font-(family-name:--font-site-mono) text-[12px] font-medium tracking-[0.1em] text-[#7d7b73] uppercase lg:w-[240px]";
const FACT_TERM =
  "font-(family-name:--font-site-mono) text-[11px] tracking-[0.1em] text-[#7d7b73] uppercase";

const FACTS: readonly { term: string; value: string }[] = [
  { term: "Platform", value: "Web, phone first" },
  { term: "Price", value: "Free" },
  { term: "Sign-in", value: "Google, Discord" },
  { term: "Status", value: "In development" },
];

/** About (tribute line, two paragraphs, fact list) and the four docs link rows. */
export function AboutSection(): ReactNode {
  return (
    <section id="about" className="scroll-mt-4">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-16 px-4 py-16 sm:px-8 lg:gap-[72px] lg:px-[120px] lg:py-24">
        <div className="flex flex-col gap-6 lg:flex-row lg:gap-24">
          <h2 className={`${LABEL} lg:pt-3`}>About</h2>
          <div className="flex grow flex-col gap-10 xl:flex-row xl:gap-20">
            <div className="flex max-w-[640px] flex-col gap-[18px] text-[17px] leading-[1.7] text-[#cfcdc5] sm:text-[18px]">
              <p className="m-0 mb-1.5 font-(family-name:--font-site-serif) text-[32px] leading-[1.15] text-[#ecebe6] sm:text-[40px]">
                A tribute to Brave Frontier&apos;s <em className="text-[#d4b06a]">Omni era</em>.
              </p>
              <p className="m-0">
                The original battle system, rebuilt in the browser with a new cast: tap timing,
                sparks, crystal drops, and the full burst ladder, matched against worked reference
                cases.
              </p>
              <p className="m-0">
                Characters, names, art, and story are original. There are no payments, no ads, and
                no energy system. Battle results and summons are decided on the server.
              </p>
            </div>
            <dl className="m-0 grid w-full max-w-[280px] shrink-0 grid-cols-2 content-start gap-x-6 gap-y-[22px] text-[14px] xl:pt-3.5">
              {FACTS.map((fact) => (
                <div key={fact.term} className="flex flex-col gap-1">
                  <dt className={FACT_TERM}>{fact.term}</dt>
                  <dd className="m-0">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        <div className="flex flex-col gap-6 lg:flex-row lg:gap-24">
          <h2 className={`${LABEL} lg:pt-2`}>Docs</h2>
          <ul className="m-0 flex max-w-[720px] grow list-none flex-col p-0">
            {DOCS_LINKS.map((doc) => (
              <li key={doc.title} className="border-t border-[#222329] last:border-b">
                <Link
                  href={DOCS_PATH}
                  className="group flex h-14 items-center justify-between gap-4 text-[17px] hover:text-[#d4b06a]"
                >
                  <span>{doc.title}</span>
                  <span className="text-right text-[14px] text-[#7d7b73] group-hover:text-[#d4b06a]">
                    {doc.blurb}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
