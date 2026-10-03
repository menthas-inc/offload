// 034 AC-36. The web says it is up, to the Core API, once a minute: a public
// route that answers that it is there, and nothing else. No session, no
// cookie, no cache. Anybody can ask it, so it says nothing about the build:
// not the commit, and not when the process started.

import { afterEach, describe, expect, it } from "vitest";
import { GET, dynamic } from "../src/app/healthz/route";

const saved = process.env["RAILWAY_GIT_COMMIT_SHA"];
afterEach(() => {
  if (saved === undefined) delete process.env["RAILWAY_GIT_COMMIT_SHA"];
  else process.env["RAILWAY_GIT_COMMIT_SHA"] = saved;
});

describe("/healthz", () => {
  it("answers that it is up, and is never cached", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true });
    expect(dynamic).toBe("force-dynamic");
  });

  it("does not say which commit it runs or when it started", async () => {
    process.env["RAILWAY_GIT_COMMIT_SHA"] = "web5678";
    const text = await GET().text();
    expect(text).not.toContain("web5678");
    expect(text).toBe(JSON.stringify({ ok: true }));
  });
});
