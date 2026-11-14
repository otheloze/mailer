import { describe, expect, it } from "vitest";
import { emailDomain, isDomainAllowed, parseDomainList, senderDomainError } from "./sender-domains";

describe("sender domains", () => {
  it("parses deployment domain lists", () => {
    expect(parseDomainList(" Mail.Example.com, @other.org  third.net ")).toEqual(["mail.example.com", "other.org", "third.net"]);
    expect(parseDomainList(undefined)).toEqual([]);
  });

  it("extracts the domain of an address", () => {
    expect(emailDomain("News@Mail.Example.com")).toBe("mail.example.com");
    expect(emailDomain("invalid")).toBe("");
  });

  it("only allows exact approved domains", () => {
    const allowed = new Set(["example.com"]);
    expect(isDomainAllowed("hello@example.com", allowed)).toBe(true);
    expect(isDomainAllowed("hello@EXAMPLE.com", allowed)).toBe(true);
    expect(isDomainAllowed("hello@evil-example.com", allowed)).toBe(false);
    expect(isDomainAllowed("hello@example.com.evil.io", allowed)).toBe(false);
    expect(isDomainAllowed("hello@sub.example.com", allowed)).toBe(false);
  });

  it("explains why a sender is rejected", () => {
    expect(senderDomainError("a@example.com", new Set(["example.com"]))).toBeNull();
    expect(senderDomainError("a@other.com", new Set(["example.com"]))).toContain("example.com");
    expect(senderDomainError("a@other.com", new Set())).toContain("administrator");
  });
});
