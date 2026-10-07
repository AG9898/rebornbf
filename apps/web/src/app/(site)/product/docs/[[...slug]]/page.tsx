import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { DocsDrawer } from "../../../../../components/site/docs/DocsDrawer.tsx";
import { DocsPager } from "../../../../../components/site/docs/DocsPager.tsx";
import { DocsSidebar } from "../../../../../components/site/docs/DocsSidebar.tsx";
import { DocsToc } from "../../../../../components/site/docs/DocsToc.tsx";
import { docsPages, docsStem } from "../../../../../components/site/docs/nav.ts";
import { extractToc } from "../../../../../components/site/docs/toc.ts";
import { SITE_TITLE, SOURCE_URL } from "../../../../../components/site/site.ts";

/** Every written page is prerendered; any other path under /product/docs is a 404. */
export const dynamicParams = false;

export function generateStaticParams(): { slug: string[] }[] {
  return docsPages().map((page) => ({ slug: page.slug === "" ? [] : page.slug.split("/") }));
}

function findPage(slug: string[] | undefined) {
  const joined = (slug ?? []).join("/");
  return docsPages().find((page) => page.slug === joined);
}

export async function generateMetadata(
  props: PageProps<"/product/docs/[[...slug]]">,
): Promise<Metadata> {
  const page = findPage((await props.params).slug);
  return {
    title:
      page && page.slug !== "" ? `${page.title} · Docs · ${SITE_TITLE}` : `Docs · ${SITE_TITLE}`,
    description: `Player docs for ${SITE_TITLE}. The full guide arrives at launch.`,
  };
}

/** One docs page: sidebar, MDX article with breadcrumb and previous/next, and "On this page". */
export default async function DocsPage(
  props: PageProps<"/product/docs/[[...slug]]">,
): Promise<ReactNode> {
  const page = findPage((await props.params).slug);
  if (!page) {
    notFound();
  }
  const stem = docsStem(page.slug);
  const { default: Content } = await import(`../../../../../content/docs/${stem}.mdx`);
  // Read at build time (the route is fully static) to list the page's h2/h3 headings.
  const source = await readFile(join(process.cwd(), "src/content/docs", `${stem}.mdx`), "utf8");
  const toc = extractToc(source);

  return (
    <>
      <DocsDrawer label={page.title}>
        <DocsSidebar activeSlug={page.slug} />
        {/* The top bar hides its site links below `sm`, so the drawer carries them. */}
        <div className="flex gap-6 border-t border-[#1c2338] px-3 pt-4 text-[15px] font-bold text-[#c9c6d8] sm:hidden">
          <Link href="/product">Product</Link>
          <a href={SOURCE_URL}>Source</a>
        </div>
      </DocsDrawer>
      <div className="flex grow">
        <div className="hidden w-[288px] shrink-0 border-r border-[#1c2338] bg-[#090d18] lg:block">
          <div className="sticky top-[68px] max-h-[calc(100dvh-68px)] overflow-y-auto px-[18px] py-7">
            <DocsSidebar activeSlug={page.slug} />
          </div>
        </div>
        <main className="flex min-w-0 grow justify-center px-4 pt-8 pb-16 sm:px-8 lg:px-[72px] lg:pt-11">
          <article className="flex w-full max-w-[740px] min-w-0 flex-col gap-6">
            <div className="flex items-center gap-2 text-[14px] font-bold text-[#8e8ba0]">
              <span>{page.group}</span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="m9 6 6 6-6 6" />
              </svg>
              <span className="text-[#c9c6d8]">{page.title}</span>
            </div>
            <Content />
            <DocsPager slug={page.slug} />
          </article>
        </main>
        <aside className="hidden w-[240px] shrink-0 xl:block">
          <div className="sticky top-[68px] flex flex-col gap-[26px] pt-[52px] pr-7">
            <DocsToc entries={toc} />
          </div>
        </aside>
      </div>
    </>
  );
}
