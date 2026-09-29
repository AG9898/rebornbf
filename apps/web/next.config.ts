import createMDX from "@next/mdx";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@bfr/engine", "@bfr/data"],
};

/**
 * MDX for the player docs (M7-04B). Docs pages are `.mdx` files imported by the docs route, not
 * file-routed pages, so `pageExtensions` stays at its default. Element styles live in
 * `src/mdx-components.tsx`.
 */
const withMDX = createMDX({});

export default withMDX(nextConfig);
