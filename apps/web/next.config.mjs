// What every page is served with, and where the site answers from.
//
// The headers are the security review of 2026-09-22, M4. Before it the app
// sent a redirect and nothing else: no HSTS, no content security policy,
// nothing stopping a frame, and the framework's name on every response.

const API = process.env.NEXT_PUBLIC_API_URL ?? "https://api.offload.club";

// One policy, enforced. Scripts stay open to inline because the App Router
// bootstraps with inline scripts and a nonce per request needs middleware,
// which is the next step; everything else is closed: nothing frames us, no
// plugins, no base tag, forms post here only, and the only origin the page
// talks to is the API. Pictures a link brought with it come from the site that
// published them, which is why images allow https.
const csp = [
  "default-src 'self'",
  // Next's dev server evaluates strings for source maps and fast refresh, so
  // development alone admits eval; production does not, and never did.
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  `img-src 'self' ${API} https: data: blob:`,
  `media-src 'self' ${API} blob:`,
  `connect-src 'self' ${API}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The recorder wants the microphone; nothing wants the rest.
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self), payment=(), usb=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [
      {
        // One canonical host. Two hostnames serving the same pages splits
        // links and analytics between them and makes the cookie domain
        // ambiguous, and the session cookie is scoped to .offload.club.
        source: "/:path*",
        has: [{ type: "host", value: "www.offload.club" }],
        destination: "https://offload.club/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
