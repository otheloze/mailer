import type { SupabaseClient } from "@supabase/supabase-js";
import { getResend } from "@/lib/resend";
import { parseMoneyToMinor, paypalApiBase } from "@/lib/payment-providers";

export type LeadOrder = {
  id: string;
  email: string;
  lead_count: number;
  amount_minor: number;
  currency: string;
  status: string;
  payment_provider: "paypal" | "paystack";
  provider_reference: string;
  targeting: string | null;
};

const ORDER_COLUMNS = "id,email,lead_count,amount_minor,currency,status,payment_provider,provider_reference,targeting";

/** PayPal custom_id for lead orders, so webhooks can tell them apart from package payments. */
export const leadOrderCustomId = (orderId: string) => `lead:${orderId}`;

export type MarkPaidResult =
  | { status: "paid"; order: LeadOrder; newlyPaid: boolean }
  | { status: "not_found" }
  | { status: "mismatch"; message: string }
  | { status: "error"; message: string };

/**
 * Marks a lead order paid after the provider confirmed the payment.
 * Idempotent: repeated webhooks or page reloads return the same result.
 * Amount and currency must match what this server registered for the order.
 */
export async function markLeadOrderPaid(admin: SupabaseClient, input: {
  provider: "paypal" | "paystack";
  reference: string;
  amountMinor: number | null;
  currency: string | null | undefined;
  paidAt?: string | null;
}): Promise<MarkPaidResult> {
  const { data: order, error } = await admin.from("lead_data_orders").select(ORDER_COLUMNS)
    .eq("payment_provider", input.provider).eq("provider_reference", input.reference).maybeSingle<LeadOrder>();
  if (error) return { status: "error", message: error.message };
  if (!order) return { status: "not_found" };
  if (order.status === "paid" || order.status === "fulfilled") return { status: "paid", order, newlyPaid: false };
  if (order.status !== "pending") return { status: "mismatch", message: `Order is ${order.status}.` };
  if (input.amountMinor !== order.amount_minor || input.currency?.toUpperCase() !== order.currency.toUpperCase()) {
    return { status: "mismatch", message: "Paid amount does not match the order." };
  }
  const { data: updated, error: updateError } = await admin.from("lead_data_orders")
    .update({ status: "paid", paid_at: input.paidAt ?? new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", order.id).eq("status", "pending")
    .select(ORDER_COLUMNS).maybeSingle<LeadOrder>();
  if (updateError) return { status: "error", message: updateError.message };
  if (!updated) {
    // Another request (webhook vs. return page) marked it first.
    return { status: "paid", order: { ...order, status: "paid" }, newlyPaid: false };
  }
  await notifyLeadOrderPaid(updated);
  return { status: "paid", order: updated, newlyPaid: true };
}

type PayPalOrder = {
  id?: string;
  status?: string;
  purchase_units?: {
    custom_id?: string;
    payments?: { captures?: { id?: string; status?: string; amount?: { value?: string; currency_code?: string }; create_time?: string }[] };
  }[];
};

/**
 * Looks up a PayPal order (capturing it if the buyer approved it) and returns
 * the completed capture, or `pending` if the buyer has not finished paying.
 */
export async function confirmPayPalLeadOrder(token: string, orderId: string, leadOrderId: string): Promise<
  | { status: "completed"; amountMinor: number | null; currency: string | undefined; paidAt: string | undefined }
  | { status: "pending" }
  | { status: "invalid"; message: string }
> {
  const base = paypalApiBase();
  const getOrder = async () => {
    const response = await fetch(`${base}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    const order = await response.json().catch(() => null) as PayPalOrder | null;
    if (!response.ok || !order?.id) throw new Error("Could not retrieve PayPal order details.");
    return order;
  };
  let order = await getOrder();
  if (order.status === "APPROVED") {
    const capture = await fetch(`${base}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "PayPal-Request-Id": `capture-${leadOrderId}` },
      body: "{}", cache: "no-store", signal: AbortSignal.timeout(20000),
    });
    const captured = await capture.json().catch(() => null) as PayPalOrder | null;
    order = capture.ok && captured?.id ? captured : await getOrder();
  }
  const unit = order.purchase_units?.[0];
  if (unit?.custom_id && unit.custom_id !== leadOrderCustomId(leadOrderId)) return { status: "invalid", message: "PayPal order does not belong to this purchase." };
  const completed = unit?.payments?.captures?.find((item) => item.status === "COMPLETED");
  if (order.status !== "COMPLETED" || !completed) return { status: "pending" };
  return {
    status: "completed",
    amountMinor: parseMoneyToMinor(completed.amount?.value),
    currency: completed.amount?.currency_code,
    paidAt: completed.create_time,
  };
}

const money = (minor: number, currency: string) =>
  new Intl.NumberFormat(currency === "NGN" ? "en-NG" : "en-US", { style: "currency", currency, maximumFractionDigits: currency === "NGN" ? 0 : 2 }).format(minor / 100);

/**
 * Best-effort notifications when an order is newly paid. Sent only when
 * ORDER_FROM_EMAIL is configured (an address on a Resend-verified domain).
 * ORDER_NOTIFICATION_EMAIL receives an internal "new order" alert.
 */
async function notifyLeadOrderPaid(order: LeadOrder) {
  const from = process.env.ORDER_FROM_EMAIL;
  if (!from || !process.env.RESEND_API_KEY) return;
  const count = order.lead_count.toLocaleString("en-US");
  const total = money(order.amount_minor, order.currency);
  const shortId = order.id.slice(0, 8).toUpperCase();
  try {
    await getResend().emails.send({
      from: `MYMAILMARKET <${from}>`,
      to: [order.email],
      subject: `Order ${shortId} confirmed: ${count} verified email leads`,
      text: [
        "Thank you for your order.",
        "",
        `Order: ${shortId}`,
        `Package: ${count} verified email leads`,
        `Paid: ${total} via ${order.payment_provider === "paypal" ? "PayPal" : "Paystack"}`,
        order.targeting ? `Targeting: ${order.targeting}` : "Targeting: not specified",
        "",
        "Our team will contact you at this address to confirm your targeting and deliver your lead file.",
        "",
        "MYMAILMARKET",
      ].join("\n"),
    });
    const alertTo = process.env.ORDER_NOTIFICATION_EMAIL;
    if (alertTo) {
      await getResend().emails.send({
        from: `MYMAILMARKET Orders <${from}>`,
        to: [alertTo],
        subject: `New lead data order ${shortId}: ${count} leads (${total})`,
        text: `Customer: ${order.email}\nPackage: ${count} leads\nPaid: ${total} via ${order.payment_provider}\nTargeting: ${order.targeting || "not specified"}\n\nFulfil it in Administration > Lead data orders.`,
      });
    }
  } catch (error) {
    console.error("Lead order notification failed:", error instanceof Error ? error.message : error);
  }
}
