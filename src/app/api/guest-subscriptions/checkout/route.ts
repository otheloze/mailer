import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIp, rateLimitResponse } from "@/lib/rate-limit";
import { getPayPalAccessToken, paypalApiBase } from "@/lib/payment-providers";

const schema = z.object({
  packageSlug: z.string().regex(/^[a-z0-9-]{2,40}$/),
  provider: z.enum(["paypal", "paystack"]),
  email: z.string().trim().email().max(254),
});

function failed(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function markFailed(admin: ReturnType<typeof createAdminClient>, paymentId: string) {
  const { error } = await admin.from("subscription_payments")
    .update({ status: "failed" }).eq("id", paymentId).eq("status", "pending");
  if (error) console.error("Could not mark failed guest checkout:", error.message);
}

export async function POST(request: NextRequest) {
  const limited = await rateLimitResponse(`guest-checkout:${clientIp(request.headers)}`, 10, 3600);
  if (limited) return limited;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return failed("Enter a valid email address and choose a package and payment provider.", 400);

  const { packageSlug, provider } = parsed.data;
  const email = parsed.data.email.toLowerCase();
  if (provider === "paypal" && !process.env.PAYPAL_CLIENT_SECRET) {
    return failed("PayPal server credentials are not configured.", 503);
  }
  if (provider === "paystack" && !process.env.PAYSTACK_SECRET_KEY) {
    return failed("Paystack server credentials are not configured.", 503);
  }

  const admin = createAdminClient();
  const [{ data: plan, error: planError }, { count, error: countError }] = await Promise.all([
    admin.from("subscription_packages")
      .select("id,slug,name,price_cents,paystack_price_kobo,email_sending_credits,email_discovery_credits,enabled")
      .eq("slug", packageSlug).eq("enabled", true).maybeSingle(),
    admin.from("subscription_payments").select("id", { count: "exact", head: true })
      .eq("payment_provider", provider).eq("checkout_email", email).is("user_id", null)
      .eq("status", "pending").gte("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString()),
  ]);
  if (planError || countError) {
    console.error("Guest checkout lookup failed:", JSON.stringify({
      packageError: planError ? { code: planError.code, message: planError.message } : null,
      paymentError: countError ? { code: countError.code, message: countError.message } : null,
    }));
    if (countError) {
      const { error: schemaError } = await admin.from("subscription_payments")
        .select("checkout_email").limit(0);
      if (schemaError?.code === "42703") {
        console.error("Guest checkout requires the latest Supabase migrations.");
        return failed("Guest checkout is not set up in Supabase yet. Apply the latest migrations, then try again.", 503);
      }
    }
    return failed("Could not prepare checkout. Please try again.", 500);
  }
  if (!plan) return failed("This package is not available.", 404);
  if ((count ?? 0) >= 5) return failed("Too many pending checkouts for this email. Wait a few minutes or finish an existing payment.", 429);

  const currency = provider === "paypal" ? "USD" : "NGN";
  const amountMinor = provider === "paypal" ? plan.price_cents : plan.paystack_price_kobo;
  if (!amountMinor || amountMinor < 1) return failed(`This package is not configured for ${provider}.`, 409);

  const paymentId = crypto.randomUUID();
  const paymentReference = `${provider}-${crypto.randomUUID()}`;
  const { data: payment, error: paymentError } = await admin.from("subscription_payments").insert({
    id: paymentId,
    user_id: null,
    checkout_email: email,
    package_id: plan.id,
    amount_cents: amountMinor,
    currency,
    status: "pending",
    payment_provider: provider,
    provider_reference: paymentReference,
    metadata: { package_slug: plan.slug, guest_checkout: true },
  }).select("id").single();
  if (paymentError || !payment) {
    console.error("Could not register guest checkout:", paymentError?.message);
    return failed("Could not register this checkout. Please try again.", 500);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  // `url` is the hosted-checkout redirect (fallback). `orderId` / `accessCode`
  // let the page open PayPal Smart Buttons or the Paystack popup instead.
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
          reference: paymentReference,
          callback_url: `${appUrl}/pricing?checkout=paystack&reference=${encodeURIComponent(paymentReference)}`,
          metadata: { payment_id: payment.id, package_slug: plan.slug, guest_checkout: true },
        }),
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      });
    } catch (error) {
      await markFailed(admin, payment.id);
      console.error("Paystack guest checkout request failed:", error instanceof Error ? error.message : "Network error.");
      return failed("Paystack checkout is temporarily unavailable. Please try again.", 502);
    }
    const result = await response.json().catch(() => null) as {
      status?: boolean; message?: string; data?: { authorization_url?: string; access_code?: string; reference?: string };
    } | null;
    if (!response.ok || !result?.status || !result.data?.authorization_url || result.data.reference !== paymentReference) {
      await markFailed(admin, payment.id);
      console.error("Paystack guest checkout was rejected:", result?.message ?? response.statusText);
      return failed("Could not start Paystack checkout. Please try again later.", 502);
    }
    checkout = { url: result.data.authorization_url, reference: paymentReference, accessCode: result.data.access_code };
  } else {
    let token: string;
    try {
      token = await getPayPalAccessToken();
    } catch (error) {
      await markFailed(admin, payment.id);
      console.error("PayPal guest checkout authentication failed:", error instanceof Error ? error.message : "Provider error.");
      return failed("PayPal could not be reached. Check the server credentials and try again.", 503);
    }
    let response: Response;
    try {
      response = await fetch(`${paypalApiBase()}/v2/checkout/orders`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "PayPal-Request-Id": payment.id,
        },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{
            reference_id: payment.id,
            custom_id: payment.id,
            description: `${plan.name}: ${plan.email_sending_credits.toLocaleString()} email credits and ${plan.email_discovery_credits.toLocaleString()} discovery credits`,
            amount: { currency_code: currency, value: (amountMinor / 100).toFixed(2) },
          }],
          application_context: {
            return_url: `${appUrl}/pricing?checkout=paypal`,
            cancel_url: `${appUrl}/pricing?checkout=cancelled`,
            user_action: "PAY_NOW",
          },
        }),
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      });
    } catch (error) {
      await markFailed(admin, payment.id);
      console.error("PayPal guest order creation failed:", error instanceof Error ? error.message : "Network error.");
      return failed("PayPal checkout is temporarily unavailable. Please try again.", 502);
    }
    const result = await response.json().catch(() => null) as {
      id?: string; links?: { rel?: string; href?: string }[]; message?: string;
    } | null;
    const approvalUrl = result?.links?.find((link) => link.rel === "approve")?.href;
    if (!response.ok || !result?.id || !approvalUrl) {
      await markFailed(admin, payment.id);
      console.error("PayPal guest order was rejected:", result?.message ?? response.statusText);
      return failed("Could not start PayPal checkout. Please try again later.", 502);
    }
    const { error: saveError } = await admin.from("subscription_payments")
      .update({ provider_reference: result.id }).eq("id", payment.id).eq("payment_provider", "paypal");
    if (saveError) {
      await markFailed(admin, payment.id);
      console.error("Could not register PayPal guest order:", saveError.message);
      return failed("PayPal order was created but could not be registered. Contact support before trying again.", 500);
    }
    checkout = { url: approvalUrl, reference: result.id, orderId: result.id };
  }

  const response = NextResponse.json(checkout);
  response.cookies.set("mmm_guest_payment", payment.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
