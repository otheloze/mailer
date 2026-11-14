import { describe, expect, it } from "vitest";
import { clientIp } from "./rate-limit";

describe("clientIp", () => {
  it("uses the first forwarded address", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe("203.0.113.5");
  });
  it("falls back to other proxy headers", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientIp(new Headers({ "cf-connecting-ip": "192.0.2.9" }))).toBe("192.0.2.9");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
