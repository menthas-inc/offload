// The internal routes answer on the private network only.
//
// Security review 2026-09-22, L14. `/internal/v1/*` sat on the public
// hostname behind the bearer token alone. With `INTERNAL_HOST` set, a request
// for one of them that arrived by any other name is not found, before the
// token is even read.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type App } from "../src/app.js";
import { closeDb } from "../src/db.js";

let app: App;
beforeAll(async () => {
  app = await buildApp({ internalHost: "core-api.railway.internal" });
});
afterAll(async () => {
  await app.close();
  await closeDb();
});

describe("with INTERNAL_HOST set", () => {
  it("does not admit an internal route by the public name", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/internal/v1/turn-step",
      headers: { host: "api.offload.club", authorization: "Bearer nothing", "content-type": "application/json" },
      payload: { jobId: "00000000-0000-7000-8000-000000000000", text: "hi" },
    });
    expect(response.statusCode).toBe(404);
  });

  it("admits it by the private name, where the token then decides", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/internal/v1/turn-step",
      headers: { host: "core-api.railway.internal", authorization: "Bearer nothing", "content-type": "application/json" },
      payload: { jobId: "00000000-0000-7000-8000-000000000000", text: "hi" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("leaves every other route alone", async () => {
    const response = await app.inject({ method: "GET", url: "/healthz", headers: { host: "api.offload.club" } });
    expect(response.statusCode).toBe(200);
  });
});
