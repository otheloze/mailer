import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPayPalAccessToken, verifyPaystackTransaction } from "@/lib/payment-providers";
import { clientIp, rateLimitResponse } from "@/lib/rate-limit";
import { confirmPayPalLeadOrder, markLeadOrderPaid } from "@/lib/lead-orders";

const schema = z.object({
  provider: z.enum(["paypal", "paystack"]),
  reference: z.string().min(8).max(128),
});

const failed = (message: string, status: number) => NextResponse.json({ error: message }, { status });

/**
 * Called when the buyer returns from PayPal/Paystack. Confirms the payment
 * directly with the provider (never trusting the browser) and marks the
 * order paid. Webhooks do the same independently.
 */
export async function POST(request: NextRequest) {
  const limited = await rateLimitResponse(`lead-verify:${clientIp(request.headers)}`, 30, 600);
  if (limited) return limited;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return failed("Invalid payment reference.", 400);
  const orderId = request.cookies.get("mmm_lead_order")?.value;
  if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) return failed("Your checkout session expired. Contact support with your payment receipt.", 401);

  const admin = createAdminClient();
  const { data: order, error } = await admin.from("lead_data_orders")
    .select("id,email,lead_count,amount_minor,currency,status,payment_provider,provider_reference")
    .eq("id", orderId).maybeSingle();
  if (error) return failed("Could not check your order. Please try again.", 500);
  if (!order || order.payment_provider !== parsed.data.provider || order.provider_reference !== parsed.data.reference) {
    return failed("Payment reference does not match this order.", 404);
  }
  const summary = { orderId: order.id, email: order.email, leadCount: order.lead_count, amountMinor: order.amount_minor, currency: order.currency };
  if (order.status === "paid" || order.status === "fulfilled") return NextResponse.json({ paid: true, ...summary });
  if (order.status !== "pending") return failed("This order is no longer active. Please start a new checkout.", 409);

  let amountMinor: number | null;
  let currency: string | undefined;
  let paidAt: string | null | undefined;
  try {
    if (order.payment_provider === "paystack") {
      const transaction = await verifyPaystackTransaction(order.provider_reference);
      if (transaction.reference !== order.provider_reference) return failed("Paystack reference does not match this order.", 400);
      if (transaction.status !== "success") return NextResponse.json({ paid: false, pending: true });
      amountMinor = transaction.amount ?? null;
      currency = transaction.currency;
      paidAt = transaction.paid_at;
    } else {
      const token = await getPayPalAccessToken();
      const result = await confirmPayPalLeadOrder(token, order.provider_reference, order.id);
      if (result.status === "invalid") return failed(result.message, 400);
      if (result.status === "pending") return NextResponse.json({ paid: false, pending: true });
      ({ amountMinor, currency, paidAt } = result);
    }
  } catch (reason) {
    console.error("Lead order verification failed:", reason instanceof Error ? reason.message : reason);
    return failed("Could not confirm the payment with the provider yet. Refresh in a moment.", 502);
  }

  const marked = await markLeadOrderPaid(admin, { provider: order.payment_provider, reference: order.provider_reference, amountMinor, currency, paidAt });
  if (marked.status === "paid") return NextResponse.json({ paid: true, ...summary });
  if (marked.status === "mismatch") return failed(marked.message, 400);
  console.error("Could not mark lead order paid:", marked.status === "error" ? marked.message : marked.status);
  return failed("Payment confirmed, but the order could not be updated. Contact support with your receipt.", 500);
}
