/** 026. Parse an email in a worker thread, bounded in memory and in time. A
 *  malformed or hostile email costs one worker, not the API. */

import { Worker } from "node:worker_threads";
import type { ParseResult } from "./parse-worker.js";

export type { Parsed, ParsedImage, LeftOutKind } from "./parse-worker.js";

// Development and the tests run the .ts file under Node's type stripping;
// production runs the compiled .js beside this one.
const WORKER = new URL(`./parse-worker${import.meta.url.endsWith(".ts") ? ".ts" : ".js"}`, import.meta.url);

export async function parseMail(raw: Buffer, opts: { timeoutMs?: number } = {}): Promise<ParseResult> {
  const worker = new Worker(WORKER, {
    workerData: { raw: new Uint8Array(raw) },
    resourceLimits: { maxOldGenerationSizeMb: 256 },
  });
  return new Promise<ParseResult>((resolve) => {
    const done = (result: ParseResult) => {
      clearTimeout(timer);
      void worker.terminate();
      resolve(result);
    };
    const timer = setTimeout(() => done({ refused: "unparseable" }), opts.timeoutMs ?? 10_000);
    worker.once("message", (result: ParseResult) => done(result));
    worker.once("error", () => done({ refused: "unparseable" }));
    worker.once("exit", () => done({ refused: "unparseable" }));
  });
}
