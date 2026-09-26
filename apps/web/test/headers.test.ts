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

  it("leaves the content security policy to the middleware, which builds one per request", async () => {
    // One source of the policy. A second one here would be enforced beside the
    // middleware's, and a browser applies every policy it is sent. The policy
    // itself is test/csp.test.ts.
    const all = (await rules()).find((rule) => rule.source === "/:path*")!;
    expect(valueOf(all, "content-security-policy")).toBeUndefined();
    expect(valueOf(all, "content-security-policy-report-only")).toBeUndefined();
  });

  it("does not name the framework", () => {
    expect((config as { poweredByHeader?: boolean }).poweredByHeader).toBe(false);
  });
});
