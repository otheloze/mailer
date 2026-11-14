import { describe, expect, it } from "vitest";
import { hasCampaignBodyContent } from "./render-email";
import { composeBodyHtml, composeEmailHtml, composeEmailText, composePreviewText, formatInline } from "./compose-email";

describe("compose email formatting", () => {
  it("escapes user-typed HTML", () => {
    const html = composeBodyHtml(`<script>alert("x")</script> & <b>hi</b>`);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
  });

  it("builds paragraphs and line breaks", () => {
    const html = composeBodyHtml("Hello team,\nquick update.\n\nThanks!");
    expect(html.match(/<p /g)).toHaveLength(2);
    expect(html).toContain("Hello team,<br>quick update.");
  });

  it("supports bold, italic, and links", () => {
    expect(formatInline("**big** and *small*")).toBe("<strong>big</strong> and <em>small</em>");
    expect(formatInline("[Shop](https://example.com/shop)")).toContain('<a href="https://example.com/shop"');
    const bare = formatInline("Visit https://example.com.");
    expect(bare).toContain('href="https://example.com"');
    expect(bare.endsWith("</a>.")).toBe(true);
  });

  it("does not turn javascript: links into anchors", () => {
    expect(formatInline("[x](javascript:alert(1))")).not.toContain("<a ");
  });

  it("produces a plain-text alternative and preview", () => {
    expect(composeEmailText("**Hi** *there*\n\n[Shop](https://example.com)")).toBe("Hi there\n\nShop (https://example.com)");
    expect(composePreviewText("a".repeat(200)).length).toBe(140);
  });

  it("includes the compliance footer and unsubscribe placeholder", () => {
    const html = composeEmailHtml({ body: "Hello", footer: "Acme · 1 Main St" });
    expect(html).toContain("{{{RESEND_UNSUBSCRIBE_URL}}}");
    expect(html).toContain("Acme · 1 Main St");
    expect(html).toContain('data-campaign-studio-footer="true"');
    expect(hasCampaignBodyContent(html)).toBe(true);
    expect(hasCampaignBodyContent(composeEmailHtml({ body: "   ", footer: "Acme" }))).toBe(false);
  });

  it("rejects unsafe brand colors", () => {
    expect(composeEmailHtml({ body: "x", footer: "", brandColor: "red;background:url(x)" })).not.toContain("url(x)");
  });
});
