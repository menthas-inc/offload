// What every page is served with, and where the site answers from.
//
// The headers are the security review of 2026-09-22, M4. Before it the app
// sent a redirect and nothing else: no HSTS, no content security policy,
// nothing stopping a frame, and the framework's name on every response.

// The content security policy is not here. It carries a nonce, which is new
// on every request, so src/middleware.ts builds it and is its only sender.

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
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
