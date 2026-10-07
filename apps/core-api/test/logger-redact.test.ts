// What the logger refuses to write, whatever a line is handed. A review code
// lets somebody in, so it is a credential: it never reaches a log line, on
// its own, inside an object, or in a request body's additional data (039,
// security review).

import { Writable } from "node:stream";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { loggerOptions } from "../src/logger.js";

function logged(write: (log: pino.Logger) => void): string {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      lines.push(String(chunk));
      done();
    },
  });
  write(pino({ redact: (loggerOptions as pino.LoggerOptions).redact! }, stream));
  return lines.join("");
}

describe("a review code in a log line", () => {
  it("is redacted on its own and inside an object", () => {
    const out = logged((log) => {
      log.info({ reviewCode: "SENTINEL-ONE" }, "a");
      log.info({ store: { reviewCode: "SENTINEL-TWO" } }, "b");
    });
    expect(out).not.toContain("SENTINEL");
  });

  it("is redacted with the rest of a request body's additional data", () => {
    const out = logged((log) => log.info({ req: { body: { additionalData: { reviewCode: "SENTINEL-THREE" } } } }, "c"));
    expect(out).not.toContain("SENTINEL");
  });
});
