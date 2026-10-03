// 034. Whether the web is up, for the Core API's heartbeat.
//
// The Core API asks this once a minute and records what it found, so Health
// can say the web was down at ten past three without anybody having been
// looking. It answers that it is there and nothing else: no session is read
// and no cookie is set.
//
// **Nothing about the build.** Anybody can ask this, and the web shares no
// secret with the Core API to tell one caller from another, so it does not
// say which commit it runs or when the process started. Health shows the
// web's commit as unknown.

// Rendered per request: a cached answer would say "up" for a process that
// is not.
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
