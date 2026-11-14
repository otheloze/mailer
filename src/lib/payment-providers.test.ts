import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseMoneyToMinor, verifyPaystackSignature } from "./payment-providers";

describe("parseMoneyToMinor", () => {
  it("converts decimal strings exactly, including values that break float math", () => {
    expect(parseMoneyToMinor("19.99")).toBe(1999);
    expect(parseMoneyToMinor("4.35")).toBe(435); // 4.35 * 100 === 434.99999999999994 in floating point
    expect(parseMoneyToMinor("0.29")).toBe(29);
    expect(parseMoneyToMinor("5")).toBe(500);
    expect(parseMoneyToMinor("5.5")).toBe(550);
    expect(parseMoneyToMinor("50.00")).toBe(5000);
    expect(parseMoneyToMinor(15)).toBe(1500);
  });

  it("rejects malformed, negative, or over-precise amounts", () => {
    expect(parseMoneyToMinor("1.005")).toBeNull();
    expect(parseMoneyToMinor("-1.00")).toBeNull();
    expect(parseMoneyToMinor("abc")).toBeNull();
    expect(parseMoneyToMinor("")).toBeNull();
    expect(parseMoneyToMinor("1e3")).toBeNull();
    expect(parseMoneyToMinor(undefined)).toBeNull();
    expect(parseMoneyToMinor(null)).toBeNull();
  });
});

describe("verifyPaystackSignature", () => {
  const secret = "sk_test_secret";
  const body = JSON.stringify({ event: "charge.success", data: { reference: "ref_1" } });
  const sign = (payload: string, key = secret) => createHmac("sha512", key).update(payload).digest("hex");

  it("accepts a valid signature", () => {
    expect(verifyPaystackSignature(body, sign(body), secret)).toBe(true);
  });

  it("rejects tampered bodies, wrong keys, and missing values", () => {
    expect(verifyPaystackSignature(`${body} `, sign(body), secret)).toBe(false);
    expect(verifyPaystackSignature(body, sign(body, "other"), secret)).toBe(false);
    expect(verifyPaystackSignature(body, null, secret)).toBe(false);
    expect(verifyPaystackSignature(body, sign(body), undefined)).toBe(false);
    expect(verifyPaystackSignature(body, "not-hex", secret)).toBe(false);
  });
});
