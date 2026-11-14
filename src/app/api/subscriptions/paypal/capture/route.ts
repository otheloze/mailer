import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getPayPalAccessToken, parseMoneyToMinor, paypalApiBase } from "@/lib/payment-providers";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ orderId: z.string().min(5).max(128) });

type PayPalOrder = {
  id?: string;
  status?: string;
  purchase_units?: {
    custom_id?: string;
    amount?: { value?: string; currency_code?: string };
    payments?: { captures?: { id?: string; status?: string; amount?: { value?: string; currency_code?: string }; create_time?: string }[] };
  }[];
};

async function getOrder(orderId: string, token: string) {
  const response = await fetch(`${paypalApiBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const order = await response.json().catch(() => null) as PayPalOrder | null;
  if (!response.ok || !order?.id) throw new Error("Could not verify the PayPal order.");
  return order;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid PayPal order." }, { status: 400 });
  const { data: payment, error: paymentError } = await supabase.from("subscription_payments")
    .select("id,amount_cents,currency,status,provider_reference")
    .eq("user_id", user.id)
    .eq("payment_provider", "paypal")
    .eq("provider_reference", parsed.data.orderId)
    .maybeSingle();
  if (paymentError) return NextResponse.json({ error: paymentError.message }, { status: 500 });
  if (!payment) return NextResponse.json({ error: "PayPal order not found for this account." }, { status: 404 });
  if (payment.status === "paid") return NextResponse.json({ received: true, paid: true });

  let token: string;
  let order: PayPalOrder;
  try {
    token = await getPayPalAccessToken();
    order = await getOrder(parsed.data.orderId, token);
    if (order.status === "APPROVED") {
      const captureResponse = await fetch(`${paypalApiBase()}/v2/checkout/orders/${encodeURIComponent(parsed.data.orderId)}/capture`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      });
      const capturedOrder = await captureResponse.json().catch(() => null) as PayPalOrder | null;
      if (!captureResponse.ok || !capturedOrder?.id) {
        return NextResponse.json({ error: "PayPal could not capture this approved payment." }, { status: 502 });
      }
      order = capturedOrder;
    }
  } catch (error) {
    console.error("PayPal capture verification failed:", error instanceof Error ? error.message : "Provider error.");
    return NextResponse.json({ error: "Could not verify or capture the PayPal payment yet. Try again shortly." }, { status: 502 });
  }

  const unit = order.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0];
  const amount = capture?.amount ?? unit?.amount;
  if (order.id !== payment.provider_reference || unit?.custom_id !== payment.id) {
    return NextResponse.json({ error: "PayPal order does not match the registered purchase." }, { status: 400 });
  }
  if (order.status !== "COMPLETED" || capture?.status !== "COMPLETED" || !capture.id) {
    return NextResponse.json({ received: true, pending: true });
  }
  const amountMinor = parseMoneyToMinor(amount?.value);
  if (!amount?.currency_code || !Number.isSafeInteger(amountMinor) || amountMinor !== payment.amount_cents || amount.currency_code.toUpperCase() !== payment.currency.toUpperCase()) {
    return NextResponse.json({ error: "Captured PayPal amount does not match the registered purchase." }, { status: 400 });
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server database credentials are not configured." }, { status: 503 });
  }
  const admin = createAdminClient();
  const { data: result, error } = await admin.rpc("process_verified_subscription_payment", {
    p_event_id: `paypal-capture:${capture.id}`,
    p_provider: "paypal",
    p_reference: payment.provider_reference,
    p_amount_minor: amountMinor,
    p_currency: amount.currency_code,
    p_paid_at: capture.create_time ?? new Date().toISOString(),
    p_metadata: { paypal_capture_id: capture.id, paypal_order_id: order.id },
  });
  if (error) {
    console.error("PayPal payment activation failed:", error.message);
    return NextResponse.json({ error: "Payment was captured, but account activation is pending verification." }, { status: 500 });
  }
  return NextResponse.json({ received: true, paid: true, result });
}
