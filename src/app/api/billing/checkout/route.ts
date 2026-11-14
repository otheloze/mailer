import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, rateLimitResponse } from "@/lib/rate-limit";

const checkoutSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
});

export async function POST(request: Request) {
  const limited = await rateLimitResponse(`billing-checkout:${clientIp(request.headers)}`, 10, 3600);
  if (limited) return limited;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return NextResponse.json({ error: "Subscriptions are not configured yet. Please try again later." }, { status: 503 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Enter a valid email address." }, { status: 400 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const form = new URLSearchParams({
    mode: "subscription",
    customer_email: parsed.data.email,
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": "500",
    "line_items[0][price_data][recurring][interval]": "month",
    "line_items[0][price_data][product_data][name]": "MYMAILMARKET Mailbox",
    "line_items[0][price_data][product_data][description]": "Monthly MYMAILMARKET mailbox subscription",
    success_url: `${appUrl}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/?checkout=cancelled#membership`,
    "subscription_data[metadata][product]": "mymailmarket-mailbox",
  });

  let stripeResponse: Response;
  try {
    stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Secure checkout is temporarily unavailable. Please try again." }, { status: 502 });
  }

  const result = await stripeResponse.json().catch(() => null) as { url?: string; error?: { message?: string } } | null;
  if (!stripeResponse.ok || !result?.url) {
    console.error("Stripe Checkout session creation failed:", result?.error?.message ?? stripeResponse.statusText);
    return NextResponse.json({ error: "Could not start secure checkout. Please try again later." }, { status: 502 });
  }

  return NextResponse.json({ url: result.url });
}
