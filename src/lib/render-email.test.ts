import { describe, expect, it } from "vitest";
import { composeEmailHtml } from "./compose-email";
import { renderCampaignEmail } from "./render-email";

describe("renderCampaignEmail", () => {
  it("renders composed messages without React errors and keeps the body", async () => {
    const html = await renderCampaignEmail({
      html: composeEmailHtml({ body: "Hello **team**,\n\nVisit https://example.com", footer: "Acme · 1 Main St" }),
      previewText: "Hello team",
      companyName: "Acme",
      mailingAddress: "1 Main St",
    });
    expect(html).toContain("<strong>team</strong>");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain("{{{RESEND_UNSUBSCRIBE_URL}}}");
    // The composed email already has a footer, so the renderer must not add a second one.
    expect(html.match(/RESEND_UNSUBSCRIBE_URL/g)).toHaveLength(1);
  });

  it("adds the compliance footer to bare HTML", async () => {
    const html = await renderCampaignEmail({ html: "<p>Plain body</p>", previewText: "", companyName: "Acme", mailingAddress: "1 Main St" });
    expect(html).toContain("Plain body");
    expect(html).toContain("1 Main St");
    expect(html).toContain("{{{RESEND_UNSUBSCRIBE_URL}}}");
  });
});
