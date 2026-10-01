import { defineProject } from "vitest/config";

export default defineProject({
  // Next's tsconfig keeps JSX as-is (`preserve`); tests that render a component need it compiled.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    name: "web",
    include: ["src/**/*.test.ts"],
  },
});
