/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        // One canonical host. Two hostnames serving the same pages splits
        // links and analytics between them and makes the cookie domain
        // ambiguous, and the session cookie is scoped to .offload.club.
        //
        // Inert until www.offload.club is registered on the Railway service:
        // until then nothing routes here to be redirected. Correct the moment
        // it is, rather than something to remember later.
        source: "/:path*",
        has: [{ type: "host", value: "www.offload.club" }],
        destination: "https://offload.club/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
