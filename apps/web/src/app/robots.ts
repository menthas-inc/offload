import type { MetadataRoute } from "next";

// The public pages are for anyone, crawlers included. Everything else sits
// behind the gate, where a crawler only ever meets the sign-in screen and
// indexes nothing. Naming those paths here would publish a map of them, admin
// and no-invite included, for no gain, so we list none and let the gate do it.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: "https://offload.club/sitemap.xml",
  };
}
