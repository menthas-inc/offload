// Domain verification for Sign in with Apple.
//
// Apple will not accept api.offload.club as a return domain until it can fetch
// a token it issues from a fixed path on that domain. There is no way around
// it and no way to do it from a laptop: the file has to be served by whatever
// answers for the real host.
//
// The file is not a secret. It proves control of the domain to Apple and does
// nothing else, so it lives in the repository rather than in an environment
// variable, where it would be one more thing to remember on a redeploy.
//
// Read at boot rather than per request: it never changes while the process
// runs, and a missing file should be visible in the logs at startup instead of
// as a 404 someone discovers from Apple's error message.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { App } from "../app.js";

const APPLE_FILE = "apple-developer-domain-association.txt";

function load(): string | null {
  try {
    // dist/routes at runtime, src/routes under tsx, so the static directory is
    // two levels up either way.
    const here = dirname(fileURLToPath(import.meta.url));
    return readFileSync(join(here, "..", "..", "static", APPLE_FILE), "utf8");
  } catch {
    return null;
  }
}

export async function wellKnownRoutes(app: App): Promise<void> {
  const association = load();

  if (!association) {
    app.log.info(
      { file: APPLE_FILE },
      "no Apple domain association file: Sign in with Apple cannot verify this domain yet"
    );
  }

  app.get("/.well-known/apple-developer-domain-association.txt", async (_request, reply) => {
    if (!association) return reply.status(404).send("");
    // text/plain is what Apple's fetcher expects. A JSON serializer here turns
    // the token into a quoted string and the check fails for a reason nothing
    // reports.
    return reply.type("text/plain; charset=utf-8").send(association);
  });
}
