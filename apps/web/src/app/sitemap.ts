import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/privacy", "/terms", "/delete-account"].map((path) => ({ url: `https://offload.club${path}` }));
}
