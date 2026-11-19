import nodemailer from "nodemailer";

/** True when the SMTP login for the trial mail system (mail.mymailmarket.com) is configured. */
export function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM);
}

type SmtpMessage = { to: string; subject: string; html: string; text?: string; replyTo?: string; fromName?: string };

/**
 * Sends one message through the mail.mymailmarket.com SMTP login. The From
 * address is always SMTP_FROM so a trial user cannot choose the sender.
 * Used for trial test emails so they do not consume Resend credits.
 */
export async function sendViaSmtp(message: SmtpMessage) {
  if (!smtpConfigured()) throw new Error("Trial email sending is not configured yet.");
  const port = Number(process.env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10000,
    socketTimeout: 20000,
  });
  const info = await transport.sendMail({
    from: { name: message.fromName || "MYMAILMARKET", address: process.env.SMTP_FROM as string },
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
    replyTo: message.replyTo,
  });
  return info.messageId;
}
