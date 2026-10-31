// 049. The Search page's one call out: Voyage, for a query's vector.
//
// AC-6   only from four letters, at most thirty a minute per account.
// AC-6b  Voyage slow or refusing is no vector, and nothing is said.
// OFF-1  the query and Voyage's body never reach a log line.

import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EMBED_BUDGET, MEANING_FROM, embedQuery, resetBudget, VOYAGE } from "../src/search/embed.js";

const KEY = "test-key";
const vector = Array.from({ length: 1024 }, (_, i) => (i === 0 ? 1 : 0));
const ok = () => new Response(JSON.stringify({ data: [{ index: 0, embedding: vector }] }), { status: 200 });

afterEach(() => {
  vi.restoreAllMocks();
  resetBudget();
});

function stubFetch(answer: () => Promise<Response> | Response) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => answer());
}

function logged(): string[] {
  const lines: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...args) => void lines.push(args.join(" ")));
  vi.spyOn(console, "warn").mockImplementation((...args) => void lines.push(args.join(" ")));
  vi.spyOn(console, "error").mockImplementation((...args) => void lines.push(args.join(" ")));
  return lines;
}

describe("embedQuery", () => {
  it("asks Voyage for a query vector and returns pgvector's text form", async () => {
    const fetch = stubFetch(ok);
    const result = await embedQuery("account", "boiler", KEY);
    expect(result).toMatch(/^\[1(\.0)?,0(\.0)?,/);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://api.voyageai.com/v1/embeddings");
    expect(JSON.parse(String(init!.body))).toEqual({ input: ["boiler"], model: VOYAGE.model, input_type: "query", output_dimension: VOYAGE.dimension });
  });

  it("leaves the key unused outside production unless the shell opted in", async () => {
    const fetch = stubFetch(ok);
    expect(await embedQuery("account", "boiler")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("matches the worker's model, input type and width", () => {
    const python = readFileSync(new URL("../../agent/src/offload_agent/embed.py", import.meta.url), "utf8");
    expect(python).toContain(`MODEL = "${VOYAGE.model}"`);
    expect(python).toContain(`DIMENSION = ${VOYAGE.dimension}`);
  });

  it("is not called under four letters or without a key", async () => {
    const fetch = stubFetch(ok);
    expect(MEANING_FROM).toBe(4);
    expect(await embedQuery("account", "boi", KEY)).toBeNull();
    expect(await embedQuery("account", "b o i", KEY)).toBeNull();
    expect(await embedQuery("account", "boiler", "")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("a refusal, a timeout, a wrong width and a malformed body are no vector, logged without the body", async () => {
    const lines = logged();
    const secret = "the words of my query";
    for (const answer of [
      () => new Response(JSON.stringify({ detail: secret }), { status: 500 }),
      () => Promise.reject(new DOMException("timed out", "TimeoutError")),
      () => new Response(JSON.stringify({ data: [{ index: 0, embedding: [1, 2] }] }), { status: 200 }),
      () => new Response("not json", { status: 200 }),
    ]) {
      vi.spyOn(globalThis, "fetch").mockImplementationOnce(async () => answer());
      expect(await embedQuery("account", secret, KEY)).toBeNull();
    }
    expect(lines.join("\n")).not.toContain(secret);
    expect(lines.join("\n")).not.toContain("query\"");
  });

  it("stops at thirty a minute per account, for that account only", async () => {
    const fetch = stubFetch(ok);
    expect(EMBED_BUDGET).toBe(30);
    for (let i = 0; i < 30; i++) expect(await embedQuery("busy", `boiler ${i}`, KEY)).not.toBeNull();
    expect(await embedQuery("busy", "boiler again", KEY)).toBeNull();
    expect(await embedQuery("quiet", "boiler", KEY)).not.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(31);
  });
});
