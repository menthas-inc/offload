/** 041. A PDF's page count, or why it is refused, before anything about it
 *  is written: locked with a password, over a thousand pages, or unreadable.
 *  pdf.js runs in a worker thread bounded in memory and in time, so a hostile
 *  file costs one worker, not the API. */

import { Worker } from "node:worker_threads";
import type { Inspected } from "./pdf-inspect-worker.js";

export type { Inspected } from "./pdf-inspect-worker.js";
export { MAX_PAGES } from "./pdf-inspect-worker.js";

// Development and the tests run the .ts file under Node's type stripping;
// production runs the compiled .js beside this one.
const WORKER = new URL(`./pdf-inspect-worker${import.meta.url.endsWith(".ts") ? ".ts" : ".js"}`, import.meta.url);

export async function inspectPdf(bytes: Buffer, opts: { timeoutMs?: number } = {}): Promise<Inspected> {
  const worker = new Worker(WORKER, {
    workerData: { bytes: new Uint8Array(bytes) },
    resourceLimits: { maxOldGenerationSizeMb: 256 },
  });
  return new Promise<Inspected>((resolve) => {
    let settled = false;
    const done = (result: Inspected) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      resolve(result);
    };
    const timer = setTimeout(() => done({ refused: "unreadable" }), opts.timeoutMs ?? 10_000);
    worker.once("message", (result: Inspected) => done(result));
    worker.once("error", () => done({ refused: "unreadable" }));
    worker.once("exit", () => done({ refused: "unreadable" }));
  });
}
