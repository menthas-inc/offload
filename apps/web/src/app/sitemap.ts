import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/privacy", "/privacy/companies", "/terms", "/delete-account"].map((path) => ({ url: `https://offload.club${path}` }));
}
