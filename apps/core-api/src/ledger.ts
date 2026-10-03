// The rows a model call writes to `llm_usage`, priced by pricing.ts.
//
// Every route that records a model call goes through here, so there is one
// place a row is priced and no path can write one at zero.

import { costMicros, isPriced } from "./pricing.js";

export interface UsageEntry {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  latencyMs: number;
}

/** `jobId` is the job the calls were made for (034), which is what lets a
 *  person's timeline say what each of their jobs cost. */
export function ledgerRows(accountId: string, jobKind: string, category: "interactive" | "scheduled", entries: UsageEntry[], jobId: string | null) {
  return entries.map((entry) => {
    // An enum-free fact for whoever adds the price: the model name is ours,
    // not content.
    if (!isPriced(entry.model)) console.warn(JSON.stringify({ msg: "ledger_unpriced_model", model: entry.model }));
    return {
      account_id: accountId,
      job_kind: jobKind,
      category,
      model: entry.model,
      input_tokens: entry.inputTokens,
      output_tokens: entry.outputTokens,
      cache_read_tokens: entry.cacheReadTokens,
      cache_write_tokens: entry.cacheWriteTokens,
      cost_micros: costMicros(entry),
      latency_ms: entry.latencyMs,
      job_id: jobId,
    };
  });
}
