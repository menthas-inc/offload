import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./test/setup.ts"],
    // Migrates once before any file is loaded, so the first file to build the
    // app never meets an empty database (test/global-setup.ts says why).
    globalSetup: ["./test/global-setup.ts"],
    // These tests talk to the real database on purpose. A mock cannot tell you
    // whether a partial unique index does what the migration says it does.
    fileParallelism: false,
    // Longer than the pool's own `connectionTimeoutMillis`, which is 5s, and
    // longer than vitest's 5s default, which is the same number.
    //
    // That collision is why a stream test failed as "Test timed out in 5000ms"
    // rather than saying what happened: whichever fired first, the message was
    // the generic one. Above the pool's bound, a starved pool now surfaces as
    // "timeout exceeded when trying to connect", which is a diagnosis instead
    // of a stack trace of something asleep. These talk to a real database and
    // 5s was never a meaningful budget for them.
    testTimeout: 20_000,
    env: { NODE_ENV: "test" },
  },
});
