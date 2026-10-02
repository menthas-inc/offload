// OFF-1: no content in application logs. A database error carries the row it
// refused: Postgres puts "Failing row contains (...)" in `detail`, and some
// messages quote the value they rejected. The logger's error serializer keeps
// the kind of error and its code, and none of that text.
//
// Found by the security review of 032 (2026-10-02): a typed row that failed the
// url check would have put its title into the request's error line.

import { Writable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type App } from "../src/app.js";
import { closeDb } from "../src/db.js";

const lines: string[] = [];
let app: App;

/** Shaped like pg's DatabaseError: a SQLSTATE code and the row in `detail`. */
function refusedRow(): Error {
  const error = new Error('invalid input syntax for type uuid: "SENTINEL-IN-MESSAGE"') as Error & Record<string, unknown>;
  error.name = "error";
  error.code = "22P02";
  error.detail = "Failing row contains (SENTINEL-IN-DETAIL, call the plumber).";
  error.table = "content";
  error.column = "title";
  error.where = "SENTINEL-IN-WHERE";
  return error;
}

beforeAll(async () => {
  app = await buildApp({
    logStream: new Writable({
      write(chunk, _encoding, done) {
        lines.push(String(chunk));
        done();
      },
    }),
  });
  app.get("/test-only/refused-row", async () => {
    throw refusedRow();
  });
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});

describe("OFF-1 a database error reaches the log without the row", () => {
  it("logs the error's kind and code and none of its text", async () => {
    lines.length = 0;
    app.log.error({ err: refusedRow() }, "write failed");
    app.log.error({ error: refusedRow() }, "write failed");
    const out = lines.join("\n");
    expect(out).not.toContain("SENTINEL");
    expect(out).toContain("22P02");
  });

  it("keeps a failing request's error line clean too", async () => {
    lines.length = 0;
    const res = await app.inject({ method: "GET", url: "/test-only/refused-row" });
    expect(res.statusCode).toBe(500);
    const out = lines.join("\n");
    expect(out).toContain("22P02");
    expect(out).not.toContain("SENTINEL");
  });

  it("still logs an error of our own with its message", async () => {
    lines.length = 0;
    app.log.error({ err: new Error("calendar token expired") }, "sync failed");
    expect(lines.join("\n")).toContain("calendar token expired");
  });
});
