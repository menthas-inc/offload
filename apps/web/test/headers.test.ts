// What every page is served with.
//
// Security review 2026-09-22, M4. The web app had a redirect and no headers:
// no HSTS, no content security policy, nothing stopping a frame, and the
// framework's own name on every response. The config is a function, so it is
// tested as one.

import { describe, expect, it } from "vitest";
import config from "../next.config.mjs";

type Header = { key: string; value: string };
type Rule = { source: string; headers: Header[] };

async function rules(): Promise<Rule[]> {
  const headers = (config as { headers?: () => Promise<Rule[]> }).headers;
  if (!headers) throw new Error("next.config.mjs has no headers()");
  return headers();
}

function valueOf(rule: Rule, key: string): string | undefined {
  return rule.headers.find((header) => header.key.toLowerCase() === key)?.value;
}

describe("every page", () => {
  it("is served with the security headers, on one rule that covers every path", async () => {
    const all = (await rules()).find((rule) => rule.source === "/:path*");
    expect(all).toBeDefined();
    expect(valueOf(all!, "strict-transport-security")).toBe("max-age=31536000; includeSubDomains");
    expect(valueOf(all!, "x-content-type-options")).toBe("nosniff");
    expect(valueOf(all!, "x-frame-options")).toBe("DENY");
    expect(valueOf(all!, "referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(valueOf(all!, "permissions-policy")).toContain("camera=()");
    expect(valueOf(all!, "permissions-policy")).toContain("geolocation=()");
  });

  it("carries a content security policy that frames nobody and talks only to the API", async () => {
    const all = (await rules()).find((rule) => rule.source === "/:path*")!;
    const csp = valueOf(all, "content-security-policy") ?? valueOf(all, "content-security-policy-report-only");
    expect(csp).toBeDefined();
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("connect-src 'self' https://api.offload.club");
    // Pictures a link brought with it come from the site that published them.
    expect(csp).toContain("img-src 'self' https://api.offload.club https: data: blob:");
    // The faces are served from here, so no page asks Google for them: the
    // privacy page names every company that receives a request, and a font
    // host on every visit was not on it (security review 2026-09-22, M16).
    expect(csp).not.toContain("googleapis");
    expect(csp).not.toContain("gstatic");
    expect(csp).toContain("font-src 'self' data:");
    expect(csp).toContain("style-src 'self' 'unsafe-inline';");
  });

  it("does not name the framework", () => {
    expect((config as { poweredByHeader?: boolean }).poweredByHeader).toBe(false);
  });
});
