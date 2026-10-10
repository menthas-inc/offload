// What a model call costs, priced here and nowhere else.
//
// The ledger is the per-account record of spend: the daily budget reads it
// before every turn and it is what analytics and the cost sheet count. So the
// price is computed where the row is written, from the tokens the worker
// reports, and a price the worker sends is ignored. Until 2026-10-02 the
// worker sent 0 for every call and the budget could never trip.
//
// Prices are kept as micros per thousand tokens, which is dollars per million
// times a thousand, so every product is an integer and a row's price is exact.
// Anthropic's input count excludes both cache counts, so the four are
// priced apart and never subtracted from one another. Checked against
// https://platform.claude.com/docs/en/about-claude/pricing on 2026-10-02.

interface Price {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** Micros per thousand tokens: $2 per million is 2,000. */
export const MODEL_PRICES: Record<string, Price> = {
  "claude-haiku-4-5": { input: 1_000, output: 5_000, cacheRead: 100, cacheWrite: 1_250 },
  // Up to a 100K prompt, which nothing here sends. Checked against the
  // claude-api skill's table on 2026-10-10, when the nightly pass and the
  // look moved to it.
  "claude-haiku-5-5": { input: 100, output: 500, cacheRead: 10, cacheWrite: 125 },
  "claude-sonnet-5": { input: 2_000, output: 10_000, cacheRead: 200, cacheWrite: 2_500 },
  "claude-sonnet-5-5": { input: 2_000, output: 10_000, cacheRead: 200, cacheWrite: 2_500 },
  "claude-opus-5": { input: 5_000, output: 25_000, cacheRead: 500, cacheWrite: 6_250 },
  "claude-opus-5-5": { input: 4_000, output: 20_000, cacheRead: 200, cacheWrite: 5_000 },
};

/** A model missing from the table is priced at the dearest rate in it, field
 *  by field, so a model switched on before its price is added overstates the
 *  bill rather than escaping the budget. */
const DEAREST: Price = Object.values(MODEL_PRICES).reduce((a, b) => ({
  input: Math.max(a.input, b.input),
  output: Math.max(a.output, b.output),
  cacheRead: Math.max(a.cacheRead, b.cacheRead),
  cacheWrite: Math.max(a.cacheWrite, b.cacheWrite),
}));

export interface Tokens {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export function costMicros(t: Tokens): number {
  const p = MODEL_PRICES[t.model] ?? DEAREST;
  const perThousand =
    t.inputTokens * p.input + t.outputTokens * p.output + (t.cacheReadTokens ?? 0) * p.cacheRead + (t.cacheWriteTokens ?? 0) * p.cacheWrite;
  return Math.ceil(perThousand / 1_000);
}

export const isPriced = (model: string): boolean => model in MODEL_PRICES;
