import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // scripts/ is private tooling the public mirror omits (RESOLVED-61); a glob, unlike a plain
    // path, matches nothing there instead of failing.
    projects: ["packages/*", "apps/web", "scripts/*.config.ts"],
  },
});
