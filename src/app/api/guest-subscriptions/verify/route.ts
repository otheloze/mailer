import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIp, rateLimitResponse } from "@/lib/rate-limit";
import { getPayPalAccessToken, parseMoneyToMinor, paypalApiBase, verifyPaystackTransaction } from "@/lib/payment-providers";

const schema = z.object({
  provider: z.enum(["paypal", "paystack"]),
  reference: z.string().min(8).max(128),
});

type PayPalOrder = {
  id?: string;
  status?: string;
  purchase_units?: {
    custom_id?: string;
    amount?: { value?: string; currency_code?: string };
    payments?: { captures?: { id?: string; status?: string; amount?: { value?: string; currency_code?: string }; create_time?: string }[] };
  }[];
};

function failed(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  const limited = await rateLimitResponse(`guest-verify:${clientIp(request.headers)}`, 30, 600);
  if (limited) return limited;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return failed("Invalid payment reference.", 400);
  const paymentId = request.cookies.get("mmm_guest_payment")?.value;
  if (!paymentId || !/^[0-9a-f-]{36}$/i.test(paymentId)) return failed("Checkout session expired. Contact support with your payment receipt.", 401);

  const admin = createAdminClient();
  const { data: payment, error } = await admin.from("subscription_payments")
    .select("id,user_id,checkout_email,amount_cents,currency,status,payment_provider,provider_reference,paid_at,verified_at")
    .eq("id", paymentId)
    .eq("payment_provider", parsed.data.provider)
    .maybeSingle();
  if (error) {
    console.error("Guest payment lookup failed:", error.message);
    return failed("Could not check payment status. Please try again.", 500);
  }
  if (!payment || payment.provider_reference !== parsed.data.reference) {
    return failed("Payment reference does not match this checkout.", 404);
  }
  if (payment.status === "paid") {
    return NextResponse.json({ verified: true, claimed: true, email: payment.checkout_email });
  }
  if (payment.user_id !== null) return failed("This payment is already linked to an account.", 409);
  if (payment.status !== "pending") return failed("This payment is no longer available for account registration.", 409);
  if (payment.verified_at) return NextResponse.json({ verified: true, email: payment.checkout_email });

  let paidAt: string | null = null;
  if (parsed.data.provider === "paystack") {
    let transaction;
    try {
      transaction = await verifyPaystackTransaction(parsed.data.reference);
    } catch (reason) {
      console.error("Paystack guest payment verification failed:", reason instanceof Error ? reason.message : "Provider error.");
      return failed("Could not verify the Paystack payment yet. Try again shortly.", 502);
    }
    if (transaction.reference !== payment.provider_reference) return failed("Paystack reference does not match this purchase.", 400);
    if (transaction.status !== "success") return NextResponse.json({ verified: false, pending: true });
    if (transaction.amount !== payment.amount_cents || transaction.currency?.toUpperCase() !== payment.currency.toUpperCase()) {
      return failed("Verified Paystack amount does not match the selected package.", 400);
    }
    paidAt = transaction.paid_at ?? null;
  } else {
    let token: string;
    try {
      token = await getPayPalAccessToken();
    } catch (reason) {
      console.error("PayPal guest payment authentication failed:", reason instanceof Error ? reason.message : "Provider error.");
      return failed("Could not verify the PayPal payment yet. Try again shortly.", 502);
    }
    const fetchOrder = async () => {
      const response = await fetch(`${paypalApiBase()}/v2/checkout/orders/${encodeURIComponent(parsed.data.reference)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      const order = await response.json().catch(() => null) as PayPalOrder | null;
      if (!response.ok || !order?.id) throw new Error("Could not retrieve PayPal order details.");
      return order;
    };
    let order: PayPalOrder;
    try {
      order = await fetchOrder();
      if (order.status === "APPROVED") {
        const captureResponse = await fetch(`${paypalApiBase()}/v2/checkout/orders/${encodeURIComponent(parsed.data.reference)}/capture`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: "{}",
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
        });
        const capturedOrder = await captureResponse.json().catch(() => null) as PayPalOrder | null;
        if (!captureResponse.ok || !capturedOrder?.id) throw new Error("PayPal could not capture this approved payment.");
        order = capturedOrder;
      }
    } catch (reason) {
      console.error("PayPal guest payment verification failed:", reason instanceof Error ? reason.message : "Provider error.");
      return failed("Could not verify the PayPal payment yet. Try again shortly.", 502);
    }
    const unit = order.purchase_units?.[0];
    const capture = unit?.payments?.captures?.[0];
    const amount = capture?.amount ?? unit?.amount;
    const amountMinor = parseMoneyToMinor(amount?.value);
    if (order.id !== payment.provider_reference || unit?.custom_id !== payment.id) {
      return failed("PayPal order does not match this purchase.", 400);
    }
    if (order.status !== "COMPLETED" || capture?.status !== "COMPLETED" || !capture.id) {
      return NextResponse.json({ verified: false, pending: true });
    }
    if (!amount?.currency_code || !Number.isSafeInteger(amountMinor)
      || amountMinor !== payment.amount_cents
      || amount.currency_code.toUpperCase() !== payment.currency.toUpperCase()) {
      return failed("Captured PayPal amount does not match the selected package.", 400);
    }
    paidAt = capture.create_time ?? null;
  }

  const verifiedAt = new Date().toISOString();
  const { error: updateError } = await admin.from("subscription_payments")
    .update({ verified_at: verifiedAt, paid_at: paidAt ?? verifiedAt })
    .eq("id", payment.id).eq("status", "pending").is("user_id", null);
  if (updateError) {
    console.error("Could not save verified guest payment:", updateError.message);
    return failed("Payment was verified, but could not be saved yet. Try again shortly.", 500);
  }
  return NextResponse.json({ verified: true, email: payment.checkout_email });
}
