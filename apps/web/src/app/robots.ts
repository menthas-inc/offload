import type { MetadataRoute } from "next";

// The public pages are for anyone, crawlers included. Everything behind the
// gate is not, and a crawler following a link into it would only meet the
// sign-in screen over and over.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/today",
        "/threads",
        "/content",
        "/people",
        "/activity",
        "/settings",
        "/welcome",
        "/tutorial",
        "/no-invite",
        "/admin",
      ],
    },
    sitemap: "https://offload.club/sitemap.xml",
  };
}
