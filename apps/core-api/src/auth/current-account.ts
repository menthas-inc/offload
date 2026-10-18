// Who is asking. The one place a route turns a request into an account id, so
// the rule cannot drift between copies.

import type { FastifyRequest } from "fastify";
import { auth } from "./auth.js";

/** Fastify's headers as the Fetch `Headers` Better Auth reads. */
export function fetchHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    headers.append(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  return headers;
}

/** The signed-in account id, or null. Reads the session through Better Auth
 *  rather than the sessions table directly, so cookie signing and expiry are
 *  checked by the thing that issued them. */
export async function currentAccountId(request: FastifyRequest): Promise<string | null> {
  const result = await auth.api.getSession({ headers: fetchHeaders(request) });
  return result?.session.userId ?? null;
}
