// 049. A search query's vector, for the Search page's meaning arm.
//
// The worker owns document embedding and is a queue drainer with no HTTP
// surface, so the Core API makes this one call itself, with the same model,
// input type and width (a test reads both files). One call per pause from four
// letters, no retry: a slow Voyage costs the page its meaning, never its words.
//
// **The body can echo the input**, so a failure logs its status or error name
// and nothing else.

import { env, isProduction } from "../env.js";

export const VOYAGE = { model: "voyage-4", dimension: 1024 } as const;
const ENDPOINT = "https://api.voyageai.com/v1/embeddings";
/** Letters and digits, not characters: *b o i l* is four. */
export const MEANING_FROM = 4;
const SECONDS = 1.5;

/** Embeds per account per minute. The idle gate bounds a person; this bounds
 *  a script.
 *  shortcut: counted per process, so a second Core API replica doubles it;
 *  move the count into Postgres when the API runs more than one replica. */
export const EMBED_BUDGET = 30;
let minute = 0;
const spent = new Map<string, number>();

function withinBudget(accountId: string): boolean {
  const now = Math.floor(Date.now() / 60_000);
  if (now !== minute) {
    minute = now;
    spent.clear();
  }
  const used = spent.get(accountId) ?? 0;
  if (used >= EMBED_BUDGET) return false;
  spent.set(accountId, used + 1);
  return true;
}

/** For tests. */
export function resetBudget(): void {
  spent.clear();
}

function letters(query: string): number {
  return (query.match(/[\p{L}\p{N}]/gu) ?? []).length;
}

/** The key, in production or when this shell opted in with MEANING_LIVE=1. */
const liveKey = isProduction || env.MEANING_LIVE === "1" ? env.VOYAGE_API_KEY : undefined;

export async function embedQuery(accountId: string, query: string, apiKey: string | undefined = liveKey): Promise<string | null> {
  if (!apiKey || letters(query) < MEANING_FROM || !withinBudget(accountId)) return null;
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ input: [query], model: VOYAGE.model, input_type: "query", output_dimension: VOYAGE.dimension }),
      signal: AbortSignal.timeout(SECONDS * 1000),
    });
    if (response.status !== 200) return refused(`voyage ${response.status}`);
    const body = (await response.json()) as { data?: { embedding?: unknown }[] };
    const vector = body.data?.[0]?.embedding;
    if (!Array.isArray(vector) || vector.length !== VOYAGE.dimension || !vector.every((v) => typeof v === "number")) {
      return refused("voyage shape");
    }
    return `[${vector.join(",")}]`;
  } catch (error) {
    return refused(error instanceof Error ? error.name : "unknown");
  }
}

function refused(reason: string): null {
  console.warn(JSON.stringify({ level: "warn", msg: "query not embedded", reason }));
  return null;
}
