import { getResend } from "@/lib/resend";

/** Where contact-form messages and escalated tickets are delivered. */
export const SUPPORT_EMAIL = process.env.CONTACT_TO_EMAIL || "info@mymailmarket.com";

export type SupportMessage = {
  name: string;
  email: string;
  subject: string;
  message: string;
  /** "contact-form" or "ai-agent" */
  source: "contact-form" | "ai-agent";
  /** Optional chat transcript attached to agent tickets. */
  transcript?: string;
};

/**
 * Emails a support request to the team inbox. The visitor's address is set as
 * Reply-To so answering the email goes straight to them.
 * The From address must be on a Resend-verified domain (SUPPORT_FROM_EMAIL,
 * falling back to ORDER_FROM_EMAIL).
 */
export async function sendSupportEmail(input: SupportMessage) {
  const from = process.env.SUPPORT_FROM_EMAIL || process.env.ORDER_FROM_EMAIL;
  if (!from) throw new Error("SUPPORT_FROM_EMAIL is not configured.");
  const label = input.source === "ai-agent" ? "AI agent ticket" : "Contact form";
  const lines = [
    `Source: ${label}`,
    `From: ${input.name} <${input.email}>`,
    "",
    input.message,
  ];
  if (input.transcript) lines.push("", "--- Chat transcript ---", input.transcript);
  const { error } = await getResend().emails.send({
    from: `MYMAILMARKET Support <${from}>`,
    to: [SUPPORT_EMAIL],
    replyTo: input.email,
    subject: `[${label}] ${input.subject}`.slice(0, 200),
    text: lines.join("\n"),
  });
  if (error) throw new Error(error.message);
}
