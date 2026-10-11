import { describe, expect, it } from "vitest";

import { costMicros, MODEL_PRICES } from "../src/pricing.js";

// Round 1 of the swarm tuning run moved the nightly pass to Haiku 5.5 and
// round 2 moved the look. With no row, costMicros priced them at the dearest
// known model, so every pass would have filled the daily budget about fifty
// times faster than it cost (skeptic finding, 2026-10-10).
describe("the price table", () => {
  it("prices Haiku 5.5 at a tenth of a dollar per million in", () => {
    expect(MODEL_PRICES["claude-haiku-5-5"]).toEqual({
      input: 100,
      output: 500,
      cacheRead: 10,
      cacheWrite: 125,
    });
  });

  it("prices a Haiku 5.5 call by its own row, not the dearest", () => {
    const micros = costMicros({
      model: "claude-haiku-5-5",
      inputTokens: 1_000,
      outputTokens: 1_000,
      cacheReadTokens: 1_000,
      cacheWriteTokens: 0,
    });
    expect(micros).toBe(100 + 500 + 10);
  });
});
