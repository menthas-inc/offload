// Response headers on every answer the API gives.
//
// Security review 2026-09-22, M4. The API answered with CORS headers and
// nothing else: no HSTS, so a first visit over http was a downgrade point, and
// no nosniff, so a body's declared type was a suggestion. Asserted on the two
// cheapest routes rather than on one, because a header set inside a route is
// a header the next route forgets.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type App } from "../src/app.js";
import { closeDb } from "../src/db.js";

let app: App;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});

describe("every answer carries the security headers", () => {
  for (const url of ["/healthz", "/api/countries", "/api/me"]) {
    it(`on ${url}`, async () => {
      const response = await app.inject({ method: "GET", url });
      expect(response.headers["strict-transport-security"]).toBe("max-age=31536000; includeSubDomains");
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["x-frame-options"]).toBe("DENY");
      expect(response.headers["referrer-policy"]).toBe("no-referrer");
      // Nothing the API says is a page, and a page it is not is not cached.
      expect(response.headers["cache-control"]).toBe("no-store");
    });
  }

  it("does not claim a framework in a header", async () => {
    const response = await app.inject({ method: "GET", url: "/healthz" });
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });
});
