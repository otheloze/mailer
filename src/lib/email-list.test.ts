import { describe, expect, it } from "vitest";
import { extractEmails } from "./email-list";
import { isDesktopUserAgent } from "./desktop-app";

describe("extractEmails", () => {
  it("finds addresses separated by commas, spaces, semicolons and new lines", () => {
    expect(extractEmails("a@x.com, b@y.org; c@z.io\nd@w.co.uk e@v.net")).toEqual(["a@x.com", "b@y.org", "c@z.io", "d@w.co.uk", "e@v.net"]);
  });

  it("reads addresses out of CSV rows and ignores other columns", () => {
    expect(extractEmails('email,first_name\n"Jane@Example.com",Jane\njohn@example.com,John')).toEqual(["jane@example.com", "john@example.com"]);
  });

  it("lowercases and removes duplicates", () => {
    expect(extractEmails("A@X.com a@x.com A@x.COM")).toEqual(["a@x.com"]);
  });

  it("ignores text without addresses", () => {
    expect(extractEmails("no emails here @ all")).toEqual([]);
  });

  it("handles 10,000 addresses", () => {
    const list = Array.from({ length: 10_000 }, (_, index) => `user${index}@example.com`).join("\n");
    expect(extractEmails(list)).toHaveLength(10_000);
  });
});

describe("isDesktopUserAgent", () => {
  it("recognises the desktop app and older installs", () => {
    expect(isDesktopUserAgent("Mozilla/5.0 Chrome/140 Electron/45.4.1 Safari/537.36 MYMAILMARKETDesktop/1.0.1")).toBe(true);
    expect(isDesktopUserAgent("Mozilla/5.0 Chrome/140 Electron/45.4.1 Safari/537.36")).toBe(true);
  });

  it("does not match normal browsers", () => {
    expect(isDesktopUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36")).toBe(false);
  });
});
