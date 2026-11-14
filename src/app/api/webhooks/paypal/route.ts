import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPayPalAccessToken, parseMoneyToMinor, paypalApiBase } from "@/lib/payment-providers";
import { confirmPayPalLeadOrder, markLeadOrderPaid } from "@/lib/lead-orders";

type PayPalEvent = {
  id?: string;
  event_type?: string;
  create_time?: string;
  resource?: {
    id?: string;
    amount?: { value?: string; currency_code?: string };
    supplementary_data?: { related_ids?: { order_id?: string } };
  };
};

type PayPalOrder = {
  id?: string;
  status?: string;
  purchase_units?: {
    custom_id?: string;
    amount?: { value?: string; currency_code?: string };
    payments?: { captures?: { id?: string; status?: string; amount?: { value?: string; currency_code?: string }; create_time?: string }[] };
  }[];
};

export async function POST(request: Request) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return NextResponse.json({ error: "PayPal webhook is not configured." }, { status: 503 });
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server database credentials are not configured." }, { status: 503 });
  }
  let event: PayPalEvent;
  try {
    event = await request.json() as PayPalEvent;
  } catch {
    return NextResponse.json({ error: "Invalid PayPal event payload." }, { status: 400 });
  }
  if (!event.id || !event.event_type || !event.resource) {
    return NextResponse.json({ error: "Incomplete PayPal event payload." }, { status: 400 });
  }

  const token = await getPayPalAccessToken().catch((error: unknown) => {
    console.error("Could not authenticate PayPal webhook verification:", error instanceof Error ? error.message : "Provider error.");
    return null;
  });
  if (!token) return NextResponse.json({ error: "PayPal webhook verification is temporarily unavailable." }, { status: 503 });
  let verifyResponse: Response;
  try {
    verifyResponse = await fetch(`${paypalApiBase()}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_algo: request.headers.get("paypal-auth-algo"),
        cert_url: request.headers.get("paypal-cert-url"),
        transmission_id: request.headers.get("paypal-transmission-id"),
        transmission_sig: request.headers.get("paypal-transmission-sig"),
        transmission_time: request.headers.get("paypal-transmission-time"),
        webhook_id: webhookId,
        webhook_event: event,
      }),
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "PayPal webhook verification is temporarily unavailable." }, { status: 502 });
  }
  const verification = await verifyResponse.json().catch(() => null) as { verification_status?: string } | null;
  if (!verifyResponse.ok || verification?.verification_status !== "SUCCESS") {
    return NextResponse.json({ error: "Invalid PayPal webhook signature." }, { status: 400 });
  }
  if (event.event_type !== "PAYMENT.CAPTURE.COMPLETED") return NextResponse.json({ received: true });

  const orderId = event.resource.supplementary_data?.related_ids?.order_id;
  if (!orderId) return NextResponse.json({ error: "PayPal capture event is missing its order reference." }, { status: 400 });
  const admin = createAdminClient();
  const { data: payment, error: paymentError } = await admin.from("subscription_payments")
    .select("id,user_id,amount_cents,currency,status,provider_reference")
    .eq("payment_provider", "paypal")
    .eq("provider_reference", orderId)
    .maybeSingle();
  if (paymentError) return NextResponse.json({ error: paymentError.message }, { status: 500 });
  if (!payment) {
    // Not a package purchase: it may be a lead data order.
    const { data: leadOrder, error: leadError } = await admin.from("lead_data_orders")
      .select("id").eq("payment_provider", "paypal").eq("provider_reference", orderId).maybeSingle();
    if (leadError) return NextResponse.json({ error: leadError.message }, { status: 500 });
    if (!leadOrder) return NextResponse.json({ error: "PayPal payment reference is not registered." }, { status: 404 });
    let confirmed;
    try {
      confirmed = await confirmPayPalLeadOrder(token, orderId, leadOrder.id);
    } catch {
      return NextResponse.json({ error: "Could not retrieve PayPal order details." }, { status: 502 });
    }
    if (confirmed.status === "invalid") return NextResponse.json({ error: confirmed.message }, { status: 400 });
    if (confirmed.status === "pending") return NextResponse.json({ received: true, pending: true });
    const lead = await markLeadOrderPaid(admin, { provider: "paypal", reference: orderId, amountMinor: confirmed.amountMinor, currency: confirmed.currency, paidAt: confirmed.paidAt });
    if (lead.status === "paid") return NextResponse.json({ received: true });
    if (lead.status === "mismatch") return NextResponse.json({ error: lead.message }, { status: 400 });
    return NextResponse.json({ error: "Could not apply the lead order payment." }, { status: 500 });
  }
  if (payment.status === "paid") return NextResponse.json({ received: true, duplicate: true });

  let orderResponse: Response;
  try {
    orderResponse = await fetch(`${paypalApiBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return NextResponse.json({ error: "Could not retrieve PayPal order details." }, { status: 502 });
  }
  const order = await orderResponse.json().catch(() => null) as PayPalOrder | null;
  const unit = order?.purchase_units?.[0];
  const capture = unit?.payments?.captures?.find((item) => item.id === event.resource?.id);
  const amount = capture?.amount ?? event.resource.amount;
  const amountMinor = parseMoneyToMinor(amount?.value);
  if (!orderResponse.ok || order?.status !== "COMPLETED" || unit?.custom_id !== payment.id || !capture || capture.status !== "COMPLETED") {
    return NextResponse.json({ error: "PayPal capture does not match the registered purchase." }, { status: 400 });
  }
  if (!Number.isSafeInteger(amountMinor) || amountMinor !== payment.amount_cents || amount?.currency_code?.toUpperCase() !== payment.currency.toUpperCase()) {
    return NextResponse.json({ error: "PayPal capture amount does not match the registered purchase." }, { status: 400 });
  }
  if (!payment.user_id) {
    const { error: saveError } = await admin.from("subscription_payments")
      .update({ verified_at: event.create_time ?? new Date().toISOString(), paid_at: event.create_time ?? new Date().toISOString() })
      .eq("id", payment.id).eq("status", "pending").is("user_id", null);
    if (saveError) {
      console.error("Could not save verified guest PayPal payment:", saveError.message);
      return NextResponse.json({ error: "Could not save the verified payment." }, { status: 500 });
    }
    return NextResponse.json({ received: true, accountRequired: true });
  }
  const { error } = await admin.rpc("process_verified_subscription_payment", {
    p_event_id: `paypal-webhook:${event.id}`,
    p_provider: "paypal",
    p_reference: orderId,
    p_amount_minor: amountMinor,
    p_currency: amount?.currency_code,
    p_paid_at: event.create_time ?? new Date().toISOString(),
    p_metadata: { paypal_capture_id: event.resource.id, paypal_order_id: orderId },
  });
  if (error) {
    console.error("PayPal webhook activation failed:", error.message);
    return NextResponse.json({ error: "Could not apply the verified PayPal payment." }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
