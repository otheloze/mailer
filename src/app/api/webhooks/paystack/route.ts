import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPaystackSignature, verifyPaystackTransaction } from "@/lib/payment-providers";
import { markLeadOrderPaid } from "@/lib/lead-orders";

type PaystackEvent = {
  event?: string;
  data?: { id?: number | string; reference?: string; status?: string };
};

function validSignature(payload: string, header: string | null) {
  return verifyPaystackSignature(payload, header, process.env.PAYSTACK_SECRET_KEY);
}

export async function POST(request: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server database credentials are not configured." }, { status: 503 });
  }
  const rawBody = await request.text();
  if (!validSignature(rawBody, request.headers.get("paystack-signature") ?? request.headers.get("x-paystack-signature"))) {
    return NextResponse.json({ error: "Invalid Paystack webhook signature." }, { status: 400 });
  }
  let event: PaystackEvent;
  try {
    event = JSON.parse(rawBody) as PaystackEvent;
  } catch {
    return NextResponse.json({ error: "Invalid Paystack event payload." }, { status: 400 });
  }
  if (event.event !== "charge.success") return NextResponse.json({ received: true });
  const reference = event.data?.reference;
  if (!reference) return NextResponse.json({ error: "Paystack event is missing a transaction reference." }, { status: 400 });

  let transaction;
  try {
    transaction = await verifyPaystackTransaction(reference);
  } catch (error) {
    console.error("Paystack webhook transaction verification failed:", error instanceof Error ? error.message : "Provider error.");
    return NextResponse.json({ error: "Could not verify the Paystack transaction." }, { status: 502 });
  }
  if (transaction.status !== "success" || transaction.reference !== reference) return NextResponse.json({ received: true, pending: true });

  const admin = createAdminClient();
  const { data: payment, error: paymentError } = await admin.from("subscription_payments")
    .select("id,user_id,amount_cents,currency,status,provider_reference")
    .eq("payment_provider", "paystack")
    .eq("provider_reference", reference)
    .maybeSingle();
  if (paymentError) return NextResponse.json({ error: paymentError.message }, { status: 500 });
  if (!payment) {
    // Not a package purchase: it may be a lead data order.
    const lead = await markLeadOrderPaid(admin, {
      provider: "paystack",
      reference,
      amountMinor: transaction.amount ?? null,
      currency: transaction.currency,
      paidAt: transaction.paid_at,
    });
    if (lead.status === "paid") return NextResponse.json({ received: true });
    if (lead.status === "mismatch") return NextResponse.json({ error: lead.message }, { status: 400 });
    if (lead.status === "error") return NextResponse.json({ error: "Could not apply the lead order payment." }, { status: 500 });
    return NextResponse.json({ error: "Paystack payment reference is not registered." }, { status: 404 });
  }
  if (payment.status === "paid") return NextResponse.json({ received: true, duplicate: true });
  if (transaction.amount !== payment.amount_cents || transaction.currency?.toUpperCase() !== payment.currency.toUpperCase()) {
    return NextResponse.json({ error: "Verified Paystack amount does not match the registered purchase." }, { status: 400 });
  }

  if (!payment.user_id) {
    const { error: saveError } = await admin.from("subscription_payments")
      .update({ verified_at: new Date().toISOString(), paid_at: transaction.paid_at ?? new Date().toISOString() })
      .eq("id", payment.id).eq("status", "pending").is("user_id", null);
    if (saveError) {
      console.error("Could not save verified guest Paystack payment:", saveError.message);
      return NextResponse.json({ error: "Could not save the verified payment." }, { status: 500 });
    }
    return NextResponse.json({ received: true, accountRequired: true });
  }

  const { error } = await admin.rpc("process_verified_subscription_payment", {
    p_event_id: `paystack-webhook:${String(event.data?.id ?? reference)}`,
    p_provider: "paystack",
    p_reference: reference,
    p_amount_minor: transaction.amount,
    p_currency: transaction.currency,
    p_paid_at: transaction.paid_at ?? new Date().toISOString(),
    p_metadata: transaction.metadata && typeof transaction.metadata === "object" ? transaction.metadata : {},
  });
  if (error) {
    console.error("Paystack webhook activation failed:", error.message);
    return NextResponse.json({ error: "Could not apply the verified Paystack payment." }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
