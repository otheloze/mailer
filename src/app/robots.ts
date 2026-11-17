import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/admin",
        "/analytics",
        "/audiences",
        "/campaigns",
        "/contacts",
        "/dashboard",
        "/leads",
        "/scheduled",
        "/segments",
        "/settings",
        "/subscriptions",
        "/templates",
        "/auth/",
      ],
    },
    sitemap: "https://mymailmarket.com/sitemap.xml",
  };
}
