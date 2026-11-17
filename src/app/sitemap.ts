import type { MetadataRoute } from "next";

const SITE_URL = "https://mymailmarket.com";
const PUBLIC_PATHS = ["/", "/pricing", "/products", "/lead-data", "/domains/buy"];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({
    url: `${SITE_URL}${path === "/" ? "" : path}`,
    changeFrequency: "weekly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
