// The address Better Auth rates by is the one Fastify trusts.
//
// Better Auth reads x-forwarded-for itself and, with no trusted proxies
// configured, accepts the header only when it holds exactly one address.
// Otherwise it gives up, logs a warning and puts the request in one bucket
// shared by everyone it cannot place, so the sign-in limits stop being per
// person. The API log carried that warning on 2026-09-23. Fastify has already
// resolved the client address under trustProxy, so the route hands Better
// Auth that one address and nothing else.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { auth } from "../src/auth/auth.js";

await migrate(() => {});

let app: App;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** What the route put in x-forwarded-for on the request it built for Better Auth. */
async function forwarded(headers: Record<string, string>, remoteAddress = "10.0.0.9"): Promise<string | null> {
  const handler = vi
    .spyOn(auth, "handler")
    .mockResolvedValue(new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
  await app.inject({ method: "GET", url: "/api/auth/get-session", headers, remoteAddress });
  const request = handler.mock.calls[0]?.[0] as Request;
  return request.headers.get("x-forwarded-for");
}

describe("the address handed to Better Auth", () => {
  it("is the one Fastify trusts when the header carries a chain", async () => {
    expect(await forwarded({ "x-forwarded-for": "203.0.113.7, 10.1.2.3" })).toBe("203.0.113.7");
  });

  it("is the socket's when no header came", async () => {
    expect(await forwarded({}, "10.0.0.9")).toBe("10.0.0.9");
  });

  it("is the one address when the header had one", async () => {
    expect(await forwarded({ "x-forwarded-for": "198.51.100.4" })).toBe("198.51.100.4");
  });
});
