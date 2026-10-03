// 034. Whether the web is up, for the Core API's heartbeat.
//
// The Core API asks this once a minute and records what it found, so Health
// can say the web was down at ten past three without anybody having been
// looking. It answers with the commit this build runs and when the process
// started, which is everything the Services table shows, and nothing about
// anybody: no session is read and no cookie is set.
//
// **To verify on the platform, not from its documentation:** that Railway
// sets `RAILWAY_GIT_COMMIT_SHA` at runtime here. Unset, the commit reads as
// unknown.

// Rendered per request: a cached answer would say "up" for a process that
// is not.
export const dynamic = "force-dynamic";

const STARTED_AT = new Date().toISOString();

export function GET(): Response {
  return Response.json(
    { ok: true, commit: process.env["RAILWAY_GIT_COMMIT_SHA"] || null, startedAt: STARTED_AT },
    { headers: { "cache-control": "no-store" } },
  );
}
