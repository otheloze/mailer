import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type StripeEvent = {
  id: string;
  type: string;
  created: number;
  data: { object: Record<string, unknown> };
};

function isValidSignature(payload: string, header: string, secret: string) {
  const parts = header.split(",").map((part) => part.split("=", 2));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || !/^\d+$/.test(timestamp) || !signatures.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest();
  return signatures.some((signature) => {
    if (!/^[\da-f]{64}$/i.test(signature)) return false;
    return timingSafeEqual(expected, Buffer.from(signature, "hex"));
  });
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Stripe webhook is not configured." }, { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  const payload = await request.text();
  if (!isValidSignature(payload, signature, secret)) return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  let event: StripeEvent;
  try {
    event = JSON.parse(payload) as StripeEvent;
  } catch {
    return NextResponse.json({ error: "Invalid Stripe event payload." }, { status: 400 });
  }
  if (!event.id || !event.type || !event.data?.object) return NextResponse.json({ error: "Incomplete Stripe event payload." }, { status: 400 });
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server database credentials are not configured." }, { status: 503 });
  }

  const admin = createAdminClient();
  const data = event.data.object;
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    if (data.mode !== "payment" || data.payment_status !== "paid") return NextResponse.json({ received: true, pending: true });
    if (typeof data.id !== "string" || typeof data.amount_total !== "number" || typeof data.currency !== "string") {
      return NextResponse.json({ error: "Stripe checkout event is missing payment details." }, { status: 400 });
    }
    const paymentIntent = typeof data.payment_intent === "string" ? data.payment_intent : null;
    const { data: result, error } = await admin.rpc("process_subscription_checkout", {
      p_event_id: event.id,
      p_event_type: event.type,
      p_checkout_session: data.id,
      p_payment_intent: paymentIntent,
      p_amount_cents: data.amount_total,
      p_currency: data.currency,
      p_paid_at: new Date(event.created * 1000).toISOString(),
      p_metadata: data.metadata && typeof data.metadata === "object" ? data.metadata : {},
    });
    if (error) {
      console.error("Stripe subscription webhook processing failed:", error.message);
      return NextResponse.json({ error: "Could not apply the verified subscription payment." }, { status: 500 });
    }
    return NextResponse.json({ received: true, result });
  }

  if (event.type === "checkout.session.expired" && typeof data.id === "string") {
    const { error } = await admin.from("subscription_payments").update({ status: "canceled" })
      .eq("stripe_checkout_session", data.id).eq("status", "pending");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (event.type === "charge.refunded" && typeof data.payment_intent === "string") {
    const refundedAmount = Number(data.amount_refunded);
    if (!Number.isSafeInteger(refundedAmount) || refundedAmount < 0) {
      return NextResponse.json({ error: "Stripe refund event is missing a valid refunded amount." }, { status: 400 });
    }
    const { error } = await admin.rpc("process_subscription_refund", {
      p_event_id: event.id,
      p_payment_intent: data.payment_intent,
      p_refunded_cents: refundedAmount,
    });
    if (error) {
      console.error("Stripe subscription refund processing failed:", error.message);
      return NextResponse.json({ error: "Could not apply the verified subscription refund." }, { status: 500 });
    }
  }
  return NextResponse.json({ received: true });
}
