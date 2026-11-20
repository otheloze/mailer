import { describe, expect, it } from "vitest";
import { emailDomain, isDomainAllowed, isSenderAllowed, normalizeSender, parseDomainList, senderDomainError } from "./sender-domains";

const PLATFORM = "mail@mymailmarket.com";

describe("sender domains", () => {
  it("parses domain lists", () => {
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

  it("lets accounts without a confirmed domain use only the platform sender", () => {
    const none = new Set<string>();
    expect(isSenderAllowed(PLATFORM, none, PLATFORM)).toBe(true);
    expect(isSenderAllowed("MAIL@mymailmarket.com", none, PLATFORM)).toBe(true);
    expect(isSenderAllowed("ceo@mymailmarket.com", none, PLATFORM)).toBe(false);
    expect(isSenderAllowed("hello@other.com", none, PLATFORM)).toBe(false);
  });

  it("lets accounts with a confirmed domain use it as well as the platform sender", () => {
    const granted = new Set(["brand.com"]);
    expect(isSenderAllowed("news@brand.com", granted, PLATFORM)).toBe(true);
    expect(isSenderAllowed(PLATFORM, granted, PLATFORM)).toBe(true);
    expect(isSenderAllowed("news@other.com", granted, PLATFORM)).toBe(false);
  });

  it("explains why a sender is rejected", () => {
    expect(senderDomainError(PLATFORM, new Set(), PLATFORM)).toBeNull();
    expect(senderDomainError("a@other.com", new Set(), PLATFORM)).toContain(PLATFORM);
    expect(senderDomainError("a@other.com", new Set(["brand.com"]), PLATFORM)).toContain("brand.com");
  });

  it("falls back to the platform sender when the saved address is no longer allowed", () => {
    expect(normalizeSender("", [], PLATFORM)).toBe(PLATFORM);
    expect(normalizeSender(null, [], PLATFORM)).toBe(PLATFORM);
    expect(normalizeSender("ceo@mymailmarket.com", [], PLATFORM)).toBe(PLATFORM);
    expect(normalizeSender("news@brand.com", ["brand.com"], PLATFORM)).toBe("news@brand.com");
    expect(normalizeSender("news@brand.com", [], PLATFORM)).toBe(PLATFORM);
  });
});
