import { defineConfig } from "vitest/config";

export default defineConfig({
  // Next needs `"jsx": "preserve"` in tsconfig.json. Vite 8's Oxc transform,
  // which vitest 4 runs on, honours it, so a test importing anything from a
  // .tsx file got raw JSX back and failed to parse. Compile JSX the way Next
  // does.
  oxc: { jsx: { runtime: "automatic" } },
});
