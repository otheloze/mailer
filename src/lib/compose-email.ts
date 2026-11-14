/**
 * Turns a plain webmail-style message into campaign email HTML.
 *
 * Supported formatting (everything else is escaped as text):
 *   blank line      -> new paragraph
 *   single newline  -> line break
 *   **bold**        -> <strong>
 *   *italic*        -> <em>
 *   [label](https://example.com) and bare https:// URLs -> links
 */

export function escapeHtml(text: string) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

const LINK_PATTERN = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+)/g;

function linkify(escaped: string, linkColor: string) {
  return escaped.replace(LINK_PATTERN, (match, label: string | undefined, labelUrl: string | undefined, bareUrl: string | undefined) => {
    if (labelUrl) return `<a href="${labelUrl}" style="color:${linkColor};text-decoration:underline">${label}</a>`;
    if (!bareUrl) return match;
    // Keep trailing punctuation out of bare links ("see https://x.com.").
    const trimmed = bareUrl.replace(/[.,;:!?)]+$/, "");
    const rest = bareUrl.slice(trimmed.length);
    return `<a href="${trimmed}" style="color:${linkColor};text-decoration:underline">${trimmed}</a>${rest}`;
  });
}

export function formatInline(text: string, linkColor = "#1d4ed8") {
  const escaped = escapeHtml(text)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  return linkify(escaped, linkColor);
}

export function composeBodyHtml(body: string, linkColor = "#1d4ed8") {
  return body
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p style="font:16px/1.65 Arial,sans-serif;color:#262626;margin:0 0 18px">${formatInline(paragraph, linkColor).replaceAll("\n", "<br>")}</p>`)
    .join("\n");
}

/** Plain-text alternative: strips the lightweight formatting markers. */
export function composeEmailText(body: string) {
  return body
    .replace(/\r\n?/g, "\n")
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1$2")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** First line of the message, used as the inbox preview text. */
export function composePreviewText(body: string, max = 140) {
  const text = composeEmailText(body).replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * Full email document. Includes the compliance footer (mailing address and
 * Resend unsubscribe link) and the marker the server renderer uses to avoid
 * adding a second footer.
 */
export function composeEmailHtml({ body, footer, brandColor = "#1d4ed8" }: { body: string; footer: string; brandColor?: string }) {
  const color = /^#[\da-f]{3,8}$/i.test(brandColor) ? brandColor : "#1d4ed8";
  const footerContent = footer.trim() ? `${escapeHtml(footer.trim()).replaceAll("\n", "<br>")}<br>` : "";
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><style>@media(max-width:600px){.email-content{padding:24px!important}}</style></head><body style="margin:0;background:#f6f6f3;padding:24px 12px"><div class="email-content" style="max-width:600px;margin:0 auto;padding:40px;background:#fff;border-radius:10px;font-family:Arial,sans-serif">${composeBodyHtml(body, color)}<p style="margin:32px 0 0;padding-top:18px;border-top:1px solid #eee;color:#888;font:11px/1.5 Arial,sans-serif">${footerContent}You received this message because you subscribed to our updates.<br><a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:${color}">Unsubscribe</a></p><span style="display:none" data-campaign-studio-footer="true"></span></div></body></html>`;
}
