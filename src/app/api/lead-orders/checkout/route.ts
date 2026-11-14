import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getPayPalAccessToken, paypalApiBase } from "@/lib/payment-providers";
import { clientIp, rateLimitResponse } from "@/lib/rate-limit";
import { leadOrderCustomId } from "@/lib/lead-orders";

const schema = z.object({
  packageSlug: z.string().regex(/^[a-z0-9-]{2,40}$/),
  provider: z.enum(["paypal", "paystack"]),
  email: z.string().trim().toLowerCase().email().max(254),
  targeting: z.string().trim().max(500).optional().default(""),
});

const failed = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function POST(request: NextRequest) {
  const limited = await rateLimitResponse(`lead-checkout:${clientIp(request.headers)}`, 10, 3600);
  if (limited) return limited;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return failed("Enter a valid email address and choose a package.", 400);
  const { packageSlug, provider, email, targeting } = parsed.data;
  if (provider === "paypal" && !process.env.PAYPAL_CLIENT_SECRET) return failed("PayPal is not configured.", 503);
  if (provider === "paystack" && !process.env.PAYSTACK_SECRET_KEY) return failed("Paystack is not configured.", 503);

  const admin = createAdminClient();
  const [{ data: plan, error: planError }, { count, error: countError }] = await Promise.all([
    admin.from("lead_data_packages").select("id,slug,name,lead_count,price_cents,paystack_price_kobo")
      .eq("slug", packageSlug).eq("enabled", true).maybeSingle(),
    admin.from("lead_data_orders").select("id", { count: "exact", head: true })
      .eq("email", email).eq("status", "pending").gte("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString()),
  ]);
  if (planError || countError) {
    console.error("Lead checkout lookup failed:", planError?.message ?? countError?.message);
    return failed("Could not prepare checkout. Please try again.", 500);
  }
  if (!plan) return failed("This lead package is not available.", 404);
  if ((count ?? 0) >= 5) return failed("Too many unfinished checkouts for this email. Wait a few minutes and try again.", 429);

  const currency = provider === "paypal" ? "USD" : "NGN";
  const amountMinor = provider === "paypal" ? plan.price_cents : plan.paystack_price_kobo;
  if (!amountMinor || amountMinor < 1) return failed(`This package is not available with ${provider === "paypal" ? "PayPal" : "Paystack"}.`, 409);

  // Link the order to the signed-in account when there is one (optional).
  const supabase = await createClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  const orderId = crypto.randomUUID();
  const reference = `lead-${provider}-${crypto.randomUUID()}`;
  const { error: insertError } = await admin.from("lead_data_orders").insert({
    id: orderId,
    package_id: plan.id,
    user_id: user?.id ?? null,
    email,
    targeting: targeting || null,
    lead_count: plan.lead_count,
    amount_minor: amountMinor,
    currency,
    payment_provider: provider,
    provider_reference: reference,
    metadata: { package_slug: plan.slug },
  });
  if (insertError) {
    console.error("Could not register lead order:", insertError.message);
    return failed("Could not register this order. Please try again.", 500);
  }
  const markFailed = async () => {
    const { error } = await admin.from("lead_data_orders").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", orderId).eq("status", "pending");
    if (error) console.error("Could not mark lead order failed:", error.message);
  };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const description = `${plan.lead_count.toLocaleString("en-US")} verified email leads`;
  let checkout: { url: string; reference: string; orderId?: string; accessCode?: string };

  if (provider === "paystack") {
    let response: Response;
    try {
      response = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          amount: String(amountMinor),
          currency,
          reference,
          callback_url: `${appUrl}/lead-data?checkout=paystack&reference=${encodeURIComponent(reference)}`,
          metadata: { lead_order_id: orderId, product: "lead_data", package_slug: plan.slug },
        }),
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      });
    } catch (error) {
      await markFailed();
      console.error("Paystack lead checkout failed:", error instanceof Error ? error.message : error);
      return failed("Paystack is temporarily unavailable. Please try again.", 502);
    }
    const result = await response.json().catch(() => null) as { status?: boolean; message?: string; data?: { authorization_url?: string; access_code?: string; reference?: string } } | null;
    if (!response.ok || !result?.status || !result.data?.authorization_url || result.data.reference !== reference) {
      await markFailed();
      console.error("Paystack lead checkout rejected:", result?.message ?? response.statusText);
      return failed("Could not start Paystack checkout. Please try again later.", 502);
    }
    checkout = { url: result.data.authorization_url, reference, accessCode: result.data.access_code };
  } else {
    let token: string;
    try {
      token = await getPayPalAccessToken();
    } catch (error) {
      await markFailed();
      console.error("PayPal lead checkout authentication failed:", error instanceof Error ? error.message : error);
      return failed("PayPal could not be reached. Please try again.", 503);
    }
    let response: Response;
    try {
      response = await fetch(`${paypalApiBase()}/v2/checkout/orders`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "PayPal-Request-Id": orderId },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{
            reference_id: orderId,
            custom_id: leadOrderCustomId(orderId),
            description,
            amount: { currency_code: currency, value: (amountMinor / 100).toFixed(2) },
          }],
          application_context: {
            brand_name: "MYMAILMARKET",
            shipping_preference: "NO_SHIPPING",
            return_url: `${appUrl}/lead-data?checkout=paypal`,
            cancel_url: `${appUrl}/lead-data?checkout=cancelled`,
            user_action: "PAY_NOW",
          },
        }),
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      });
    } catch (error) {
      await markFailed();
      console.error("PayPal lead order failed:", error instanceof Error ? error.message : error);
      return failed("PayPal is temporarily unavailable. Please try again.", 502);
    }
    const result = await response.json().catch(() => null) as { id?: string; links?: { rel?: string; href?: string }[]; message?: string } | null;
    const approvalUrl = result?.links?.find((link) => link.rel === "approve")?.href;
    if (!response.ok || !result?.id || !approvalUrl) {
      await markFailed();
      console.error("PayPal lead order rejected:", result?.message ?? response.statusText);
      return failed("Could not start PayPal checkout. Please try again later.", 502);
    }
    const { error: saveError } = await admin.from("lead_data_orders").update({ provider_reference: result.id }).eq("id", orderId);
    if (saveError) {
      await markFailed();
      console.error("Could not save PayPal lead order ID:", saveError.message);
      return failed("PayPal order was created but could not be registered. Please try again.", 500);
    }
    checkout = { url: approvalUrl, reference: result.id, orderId: result.id };
  }

  const response = NextResponse.json(checkout);
  response.cookies.set("mmm_lead_order", orderId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
