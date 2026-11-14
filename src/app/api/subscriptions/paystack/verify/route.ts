import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPaystackTransaction } from "@/lib/payment-providers";

const schema = z.object({ reference: z.string().min(8).max(100) });

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid Paystack reference." }, { status: 400 });

  const { data: payment, error: paymentError } = await supabase.from("subscription_payments")
    .select("id,amount_cents,currency,status,provider_reference")
    .eq("user_id", user.id)
    .eq("payment_provider", "paystack")
    .eq("provider_reference", parsed.data.reference)
    .maybeSingle();
  if (paymentError) return NextResponse.json({ error: paymentError.message }, { status: 500 });
  if (!payment) return NextResponse.json({ error: "Paystack payment not found for this account." }, { status: 404 });
  if (payment.status === "paid") return NextResponse.json({ received: true, paid: true });

  let transaction;
  try {
    transaction = await verifyPaystackTransaction(parsed.data.reference);
  } catch (error) {
    console.error("Paystack payment verification failed:", error instanceof Error ? error.message : "Provider error.");
    return NextResponse.json({ error: "Could not verify the Paystack payment yet. Try again shortly." }, { status: 502 });
  }
  if (transaction.reference !== payment.provider_reference) {
    return NextResponse.json({ error: "Paystack reference does not match the registered payment." }, { status: 400 });
  }
  if (transaction.status !== "success") return NextResponse.json({ received: true, pending: true });
  if (transaction.amount !== payment.amount_cents || transaction.currency?.toUpperCase() !== payment.currency.toUpperCase()) {
    return NextResponse.json({ error: "Verified Paystack amount does not match the registered purchase." }, { status: 400 });
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server database credentials are not configured." }, { status: 503 });
  }
  const admin = createAdminClient();
  const { data: result, error } = await admin.rpc("process_verified_subscription_payment", {
    p_event_id: `paystack-verify:${transaction.reference}`,
    p_provider: "paystack",
    p_reference: payment.provider_reference,
    p_amount_minor: transaction.amount,
    p_currency: transaction.currency,
    p_paid_at: transaction.paid_at ?? new Date().toISOString(),
    p_metadata: transaction.metadata && typeof transaction.metadata === "object" ? transaction.metadata : {},
  });
  if (error) {
    console.error("Paystack payment activation failed:", error.message);
    return NextResponse.json({ error: "Payment was verified, but account activation is pending." }, { status: 500 });
  }
  return NextResponse.json({ received: true, paid: true, result });
}
