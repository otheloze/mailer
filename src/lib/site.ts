export const SITE_URL = "https://mymailmarket.com";
export const SITE_NAME = "MYMAILMARKET";
export const SITE_DESCRIPTION = "Discover business leads, manage email campaigns, and explore hosting and domain services with MYMAILMARKET.";

// Public IDs (safe to expose). Set in the production environment at build time.
export const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "G-RP11X5G0Q8";
export const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT || "ca-pub-7085125168161530";

// Signed-in / transactional areas: never show ads here and keep them out of search.
export const PRIVATE_PATH_PREFIXES = [
  "/admin", "/analytics", "/audiences", "/campaigns", "/contacts", "/dashboard", "/leads",
  "/scheduled", "/segments", "/settings", "/subscriptions", "/templates", "/login",
  "/forgot-password", "/reset-password", "/unsubscribe", "/subscribe", "/auth",
];
