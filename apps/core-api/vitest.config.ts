import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // These tests talk to the real database on purpose. A mock cannot tell you
    // whether a partial unique index does what the migration says it does.
    fileParallelism: false,
    env: { NODE_ENV: "test" },
  },
});
