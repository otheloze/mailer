import { describe, expect, it } from "vitest";
import { isPromoActive } from "./promo";

describe("isPromoActive", () => {
  it("runs through the last minute of 31 December in Lagos", () => {
    expect(isPromoActive(new Date("2026-12-31T23:59:00+01:00"))).toBe(true);
  });

  it("ends at midnight on 1 January in Lagos", () => {
    expect(isPromoActive(new Date("2027-01-01T00:00:00+01:00"))).toBe(false);
  });
});
