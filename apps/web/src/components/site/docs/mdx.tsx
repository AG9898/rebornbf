import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import { isValidElement, type ReactNode } from "react";
import styles from "./docs.module.css";
import { slugify } from "./toc.ts";

/** The plain text of rendered heading children, so the anchor id matches `extractToc`. */
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(textOf).join("");
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return textOf(node.props.children);
  }
  return "";
}

/** Headings sit below the sticky top bar (and the Sections bar on narrow screens). */
const ANCHOR = "scroll-mt-[136px] lg:scroll-mt-[88px]";
const BODY = "m-0 text-[17px] leading-[1.65] text-[#d4d1e0]";

/** A larger opening paragraph under the page title. Keep `<Lead>…</Lead>` on one line in MDX, or MDX wraps its text in a nested `<p>`. */
export function Lead({ children }: { children: ReactNode }): ReactNode {
  return <p className="m-0 text-[18px] leading-[1.6] text-[#d4d1e0] sm:text-[20px]">{children}</p>;
}

/** A slate note box with a gold border. */
export function Callout({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <aside
      className={`${styles.slate} flex flex-col gap-1 rounded-xl border border-[#c9953c] px-[22px] py-[18px]`}
    >
      <span className="text-[16px] font-extrabold text-[#f6dc98]">{title}</span>
      <div className="text-[16px] leading-[1.6] text-[#d4d1e0]">{children}</div>
    </aside>
  );
}

/** How docs MDX elements render: the mock's game look (docs/design/product-site/docs.mock.html). */
export const DOCS_MDX_COMPONENTS: MDXComponents = {
  h1: ({ children }) => (
    <h1
      className={`${styles.display} ${styles.goldText} m-0 text-[44px] leading-[1.05] sm:text-[58px]`}
    >
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2
      id={slugify(textOf(children))}
      className={`${styles.display} ${ANCHOR} m-0 mt-5 text-[28px] text-[#fff4d6] sm:text-[32px]`}
    >
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3
      id={slugify(textOf(children))}
      className={`${styles.display} ${ANCHOR} m-0 mt-3 text-[22px] text-[#fff4d6] sm:text-[24px]`}
    >
      {children}
    </h3>
  ),
  p: ({ children }) => <p className={BODY}>{children}</p>,
  ul: ({ children }) => (
    <ul className={`${BODY} flex list-disc flex-col gap-2.5 pl-[22px]`}>{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className={`${BODY} flex list-decimal flex-col gap-2.5 pl-[22px]`}>{children}</ol>
  ),
  strong: ({ children }) => <strong className="text-[#fff4d6]">{children}</strong>,
  a: ({ href = "", children }) =>
    href.startsWith("/") || href.startsWith("#") ? (
      <Link href={href} className="font-bold text-[#f3cf7a] hover:text-[#ffe7ae]">
        {children}
      </Link>
    ) : (
      <a href={href} className="font-bold text-[#f3cf7a] hover:text-[#ffe7ae]">
        {children}
      </a>
    ),
  code: ({ children }) => (
    <code className="rounded bg-[#070a13] px-1.5 py-0.5 font-(family-name:--font-docs-mono) text-[0.9em] text-[#e4e1ee]">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="m-0 overflow-x-auto rounded-xl border border-[#1f2740] bg-[#070a13] px-[22px] py-[18px] font-(family-name:--font-docs-mono) text-[15px] text-[#e4e1ee] [&_code]:bg-transparent [&_code]:p-0">
      {children}
    </pre>
  ),
  Lead,
  Callout,
};
