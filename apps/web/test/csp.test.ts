// The content security policy, built per request.
//
// Security review 2026-09-22, M4. The policy shipped as one string in
// next.config.mjs with inline scripts allowed, because the App Router
// bootstraps with inline scripts. Now src/middleware.ts mints a nonce for every
// request, and a script runs only when it carries it. This file covers the
// string and the middleware; test/csp-built.test.ts proves the same against the
// built app, where a missing nonce is a page that never hydrates.

import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { contentSecurityPolicy } from "../src/lib/csp";
import { middleware } from "../src/middleware";

const API = "https://api.offload.club";

function directive(csp: string, name: string): string | undefined {
  return csp
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `));
}

function nonceOf(csp: string | null): string | undefined {
  return /'nonce-([^']+)'/.exec(csp ?? "")?.[1];
}

describe("the policy", () => {
  const csp = contentSecurityPolicy({ nonce: "bm9uY2U=", api: API, dev: false });

  it("runs a script only when it carries this response's nonce", () => {
    expect(directive(csp, "script-src")).toBe("script-src 'self' 'nonce-bm9uY2U=' 'strict-dynamic'");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("frames nobody and talks only to the API", () => {
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("connect-src 'self' https://api.offload.club");
    expect(csp).toContain("media-src 'self' https://api.offload.club blob:");
    // Pictures a link brought with it come from the site that published them.
    expect(csp).toContain("img-src 'self' https://api.offload.club https: data: blob:");
    // The faces are served from here, so no page asks Google for them: the
    // privacy page names every company that receives a request, and a font
    // host on every visit was not on it (security review 2026-09-22, M16).
    expect(csp).not.toContain("googleapis");
    expect(csp).not.toContain("gstatic");
    expect(csp).toContain("font-src 'self' data:");
    // Inline styles are a separate question from scripts, and still allowed.
    expect(directive(csp, "style-src")).toBe("style-src 'self' 'unsafe-inline'");
  });

  it("admits eval in development alone, where Next's dev server evaluates strings", () => {
    const dev = contentSecurityPolicy({ nonce: "bm9uY2U=", api: API, dev: true });
    expect(directive(dev, "script-src")).toBe(
      "script-src 'self' 'nonce-bm9uY2U=' 'strict-dynamic' 'unsafe-eval'",
    );
  });
});

describe("the map's hosts (030, SEC-1)", () => {
  const off = contentSecurityPolicy({ nonce: "bm9uY2U=", api: API, dev: false, maps: false });
  const on = contentSecurityPolicy({ nonce: "bm9uY2U=", api: API, dev: false, maps: true });

  it("names Google only in a build made with a map key", () => {
    expect(off).not.toContain("googleapis");
    expect(off).not.toContain("gstatic");
    expect(directive(on, "connect-src")).toBe(`connect-src 'self' ${API} https://maps.googleapis.com`);
    expect(directive(on, "font-src")).toBe("font-src 'self' data: https://fonts.gstatic.com");
  });

  it("adds nothing to what may run, and no wildcard host", () => {
    expect(directive(on, "script-src")).toBe("script-src 'self' 'nonce-bm9uY2U=' 'strict-dynamic'");
    expect(on).not.toContain("'unsafe-eval'");
    expect(directive(on, "script-src")).not.toContain("blob:");
    expect(directive(on, "script-src")).not.toContain("'unsafe-inline'");
    expect(on).not.toMatch(/https:\/\/\*/);
  });

  it("is on in the middleware when the build has the key and the map id", () => {
    const served = () => middleware(new NextRequest("http://localhost/")).headers.get("content-security-policy") ?? "";
    try {
      vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_KEY", "k");
      vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAP_ID", "m");
      expect(served()).toContain("https://maps.googleapis.com");
      vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAP_ID", "");
      expect(served()).not.toContain("googleapis");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("the middleware", () => {
  function serve(path: string) {
    return middleware(new NextRequest(`http://localhost${path}`));
  }

  it("sends every response a policy with a nonce of its own", () => {
    const first = nonceOf(serve("/").headers.get("content-security-policy"));
    const second = nonceOf(serve("/").headers.get("content-security-policy"));
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first).not.toBe(second);
  });

  it("mints a nonce Next will read", () => {
    // Next ignores a nonce outside this alphabet and renders its scripts with
    // none, which the browser then refuses.
    expect(nonceOf(serve("/").headers.get("content-security-policy"))).toMatch(/^[A-Za-z0-9+/_-]+={0,2}$/);
  });

  it("admits eval only while the server runs in development", () => {
    const scriptSrc = () => directive(serve("/").headers.get("content-security-policy") ?? "", "script-src");
    try {
      vi.stubEnv("NODE_ENV", "development");
      expect(scriptSrc()).toContain("'unsafe-eval'");
      vi.stubEnv("NODE_ENV", "production");
      expect(scriptSrc()).not.toContain("'unsafe-eval'");
      vi.stubEnv("NODE_ENV", "test");
      expect(scriptSrc()).not.toContain("'unsafe-eval'");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("hands the render the same policy and nonce, which is where Next reads them", () => {
    const response = serve("/privacy");
    const csp = response.headers.get("content-security-policy");
    // NextResponse.next({ request }) forwards the request's headers as these.
    expect(response.headers.get("x-middleware-request-content-security-policy")).toBe(csp);
    expect(response.headers.get("x-middleware-request-x-nonce")).toBe(nonceOf(csp));
  });
});
