// Every page's content security policy, with a nonce of its own.
//
// Security review 2026-09-22, M4: the policy used to allow inline scripts, and
// a nonce per request is what let that go. The policy is lib/csp.ts, and this
// is its only sender; next.config.mjs keeps the other headers.
//
// A nonce only works on a page rendered for the request that carries it, so
// every page is rendered per request from here on, the marketing pages
// included. The root layout reading the request is what makes that so.

import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy } from "./lib/csp";

export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const policy = contentSecurityPolicy({
    nonce,
    // The client's own fallback, so a dev server without the variable can reach
    // its local API. Production sets it.
    api: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4701",
    dev: process.env.NODE_ENV === "development",
    // 030. The same two values the client needs before it draws a map. Not
    // the server's switch: a build with both and the switch off names the
    // hosts and makes no request, so this header is not evidence the map is on.
    maps: Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY) && Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAP_ID),
  });

  // The render reads the policy off the request and puts its nonce on Next's
  // own scripts. x-nonce is for a script the app renders itself.
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", policy);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("content-security-policy", policy);
  return response;
}

export const config = {
  // Everything but build output, which is the same for everyone and never
  // HTML. The faces and the icons used to be skipped too, until the review of
  // this change pointed out what a skipped path answers when the file is not
  // there: the not-found page, HTML with scripts of its own and no policy at
  // all. A font that carries a policy costs nothing.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
