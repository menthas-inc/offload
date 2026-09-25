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

const API = process.env.NEXT_PUBLIC_API_URL ?? "https://api.offload.club";

export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const policy = contentSecurityPolicy({ nonce, api: API, dev: process.env.NODE_ENV === "development" });

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
  // Not the files that are the same for everyone: build output, the faces, the
  // icons and the favicon. None of them runs a script.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|fonts/|icons/|brands/).*)"],
};
