import type { MDXComponents } from "mdx/types";
import { DOCS_MDX_COMPONENTS } from "./components/site/docs/mdx.tsx";

/** Required by @next/mdx in the App Router: the element styles every MDX file renders with. */
export function useMDXComponents(): MDXComponents {
  return DOCS_MDX_COMPONENTS;
}
