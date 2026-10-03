// 034 AC-36. The web says it is up, to the Core API, once a minute: a public
// route that answers with the commit it runs and when it started, and nothing
// else. No session, no cookie, no cache.

import { afterEach, describe, expect, it } from "vitest";
import { GET, dynamic } from "../src/app/healthz/route";

const saved = process.env["RAILWAY_GIT_COMMIT_SHA"];
afterEach(() => {
  if (saved === undefined) delete process.env["RAILWAY_GIT_COMMIT_SHA"];
  else process.env["RAILWAY_GIT_COMMIT_SHA"] = saved;
});

describe("/healthz", () => {
  it("answers with the commit and the start, and is never cached", async () => {
    process.env["RAILWAY_GIT_COMMIT_SHA"] = "web5678";
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as { ok: boolean; commit: string | null; startedAt: string };
    expect(Object.keys(body).sort()).toEqual(["commit", "ok", "startedAt"]);
    expect(body.ok).toBe(true);
    expect(body.commit).toBe("web5678");
    expect(Number.isNaN(new Date(body.startedAt).getTime())).toBe(false);
    expect(dynamic).toBe("force-dynamic");
  });

  it("reads the commit as unknown when the platform does not say", async () => {
    delete process.env["RAILWAY_GIT_COMMIT_SHA"];
    expect(((await GET().json()) as { commit: string | null }).commit).toBeNull();
  });
});
