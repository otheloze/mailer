import { createElement } from "react";
import { render } from "@react-email/render";
import { CampaignEmail } from "@/emails/campaign-email";

export async function renderCampaignEmail({
  html,
  previewText,
  companyName,
  mailingAddress,
}: {
  html: string;
  previewText: string;
  companyName: string | null;
  mailingAddress: string;
}) {
  const bodyHtml = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
  const hasFooter = html.includes("data-campaign-studio-footer");
  const hasUnsubscribe = /<a\b[^>]*href=["'][^"']*RESEND_UNSUBSCRIBE_URL/i.test(html);
  return render(createElement(CampaignEmail, {
    bodyHtml,
    previewText,
    companyName,
    mailingAddress,
    includeFooter: !hasFooter,
    includeUnsubscribe: !hasUnsubscribe,
  }));
}

export function hasCampaignBodyContent(html: string) {
  const bodyHtml = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
  const footerMarker = bodyHtml.indexOf('data-campaign-studio-footer="true"');
  const content = footerMarker >= 0
    ? bodyHtml.slice(0, bodyHtml.lastIndexOf("<p", footerMarker))
    : bodyHtml;
  const visibleText = content
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&(?:#\d+|#x[\da-f]+|[a-z]+);/gi, " ")
    .trim();
  return Boolean(visibleText || /<img\b[^>]*\bsrc\s*=\s*["'][^"']+["']/i.test(content));
}
