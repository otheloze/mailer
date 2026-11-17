import { HOSTING_STORE_URL } from "./links";

// Single source for the Black Friday bundle copy. Plain module (not a client
// file) so server and client components both receive the real values.
export const BLACK_FRIDAY_PROMO = {
  label: "Black Friday sale",
  headline: "One year of domain and hosting",
  prices: [
    { label: "Nigeria", currency: "NGN", price: "20,000" },
    { label: "International", currency: "USD", price: "16" },
  ],
  endsLabel: "31 December",
  href: HOSTING_STORE_URL,
  // End of 31 December 2026, Lagos time (WAT, UTC+1).
  endsAt: new Date("2027-01-01T00:00:00+01:00"),
} as const;

export function isPromoActive(now: Date = new Date()) {
  return now.getTime() < BLACK_FRIDAY_PROMO.endsAt.getTime();
}
