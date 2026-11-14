import { createHmac, timingSafeEqual } from "node:crypto";

export function paypalApiBase() {
  return process.env.PAYPAL_ENVIRONMENT === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

export async function getPayPalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID ?? process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("PayPal server credentials are not configured.");
  const response = await fetch(`${paypalApiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => null) as { access_token?: string; error_description?: string } | null;
  if (!response.ok || !result?.access_token) {
    throw new Error(`Could not authenticate with PayPal${result?.error_description ? `: ${result.error_description}` : "."}`);
  }
  return result.access_token;
}

export async function verifyPaystackTransaction(reference: string) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) throw new Error("Paystack server credentials are not configured.");
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => null) as {
    status?: boolean;
    message?: string;
    data?: { status?: string; reference?: string; amount?: number; currency?: string; paid_at?: string | null; metadata?: unknown };
  } | null;
  if (!response.ok || !result?.status || !result.data) {
    throw new Error(`Could not verify the Paystack transaction${result?.message ? `: ${result.message}` : "."}`);
  }
  return result.data;
}

/**
 * Converts a decimal money string from a provider (e.g. PayPal "19.99") into
 * integer minor units without floating-point rounding. Returns null when the
 * value is not a plain non-negative decimal with at most two fraction digits.
 */
export function parseMoneyToMinor(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const minor = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(minor) ? minor : null;
}

/** Verifies a Paystack webhook signature (HMAC-SHA512 of the raw body using the secret key). */
export function verifyPaystackSignature(payload: string, header: string | null, secretKey: string | undefined) {
  if (!header || !secretKey || !/^[\da-f]{128}$/i.test(header)) return false;
  const expected = createHmac("sha512", secretKey).update(payload).digest();
  return timingSafeEqual(expected, Buffer.from(header, "hex"));
}
