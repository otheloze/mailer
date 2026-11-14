import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getPayPalAccessToken, paypalApiBase } from "@/lib/payment-providers";

const schema = z.object({
  packageSlug: z.string().regex(/^[a-z0-9-]{2,40}$/),
  provider: z.enum(["paypal", "paystack"]),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Sign in before purchasing a package." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid package and payment provider." }, { status: 400 });
  const provider = parsed.data.provider;
  if (provider === "paypal" && !process.env.PAYPAL_CLIENT_SECRET) {
    return NextResponse.json({ error: "PayPal server credentials are not configured." }, { status: 503 });
  }
  if (provider === "paystack" && !process.env.PAYSTACK_SECRET_KEY) {
    return NextResponse.json({ error: "Paystack server credentials are not configured." }, { status: 503 });
  }

  const [packageResult, accountResult] = await Promise.all([
    supabase.from("subscription_packages").select("*").eq("slug", parsed.data.packageSlug).eq("enabled", true).maybeSingle(),
    supabase.from("client_account_controls").select("status").eq("user_id", user.id).maybeSingle(),
  ]);
  if (packageResult.error || accountResult.error) return NextResponse.json({ error: packageResult.error?.message ?? accountResult.error?.message }, { status: 500 });
  if (!packageResult.data) return NextResponse.json({ error: "This package is not available." }, { status: 404 });
  if ((accountResult.data?.status ?? "active") !== "active") return NextResponse.json({ error: "This account cannot purchase a package. Contact an administrator." }, { status: 403 });
  if (!user.email) return NextResponse.json({ error: "Add an email address to your account before purchasing." }, { status: 400 });

  const currency = provider === "paypal" ? "USD" : "NGN";
  const amountMinor = provider === "paypal" ? packageResult.data.price_cents : packageResult.data.paystack_price_kobo;
  if (!amountMinor || amountMinor < 1) return NextResponse.json({ error: `This package is not configured for ${provider}.` }, { status: 409 });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const paymentReference = `${provider}-${crypto.randomUUID()}`;
  const { data: payment, error: paymentError } = await supabase.from("subscription_payments").insert({
    user_id: user.id,
    package_id: packageResult.data.id,
    amount_cents: amountMinor,
    currency,
    status: "pending",
    payment_provider: provider,
    provider_reference: paymentReference,
    metadata: { package_slug: packageResult.data.slug },
  }).select("id").single();
  if (paymentError || !payment) {
    return NextResponse.json({ error: paymentError?.message ?? "Could not register this payment." }, { status: 500 });
  }

  if (provider === "paystack") {
    let response: Response;
    try {
      response = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          amount: String(amountMinor),
          currency,
          reference: paymentReference,
          callback_url: `${appUrl}/subscriptions?checkout=paystack&reference=${encodeURIComponent(paymentReference)}`,
          metadata: { payment_id: payment.id, user_id: user.id, package_slug: packageResult.data.slug },
        }),
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      });
    } catch (error) {
      const { error: saveError } = await supabase.from("subscription_payments").update({ status: "failed" }).eq("id", payment.id).eq("status", "pending");
      console.error("Paystack checkout initialization failed:", error instanceof Error ? error.message : "Network error.", saveError?.message);
      return NextResponse.json({ error: "Paystack checkout is temporarily unavailable. Please try again." }, { status: 502 });
    }
    const result = await response.json().catch(() => null) as {
      status?: boolean; message?: string; data?: { authorization_url?: string; access_code?: string; reference?: string };
    } | null;
    if (!response.ok || !result?.status || !result.data?.authorization_url || result.data.reference !== paymentReference) {
      const { error: saveError } = await supabase.from("subscription_payments").update({ status: "failed" }).eq("id", payment.id).eq("status", "pending");
      console.error("Paystack checkout initialization rejected:", result?.message ?? response.statusText, saveError?.message);
      return NextResponse.json({ error: "Could not start Paystack checkout. Please try again later." }, { status: 502 });
    }
    return NextResponse.json({ url: result.data.authorization_url, reference: paymentReference, accessCode: result.data.access_code });
  }

  let token: string;
  try {
    token = await getPayPalAccessToken();
  } catch (error) {
    const { error: saveError } = await supabase.from("subscription_payments").update({ status: "failed" }).eq("id", payment.id).eq("status", "pending");
    console.error("PayPal authentication failed:", error instanceof Error ? error.message : "Provider error.", saveError?.message);
    return NextResponse.json({ error: "PayPal could not be reached. Check the server credentials and try again." }, { status: 503 });
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
          description: `${packageResult.data.name}: ${packageResult.data.email_sending_credits.toLocaleString()} email credits and ${packageResult.data.email_discovery_credits.toLocaleString()} discovery credits`,
          amount: { currency_code: currency, value: (amountMinor / 100).toFixed(2) },
        }],
        application_context: {
          return_url: `${appUrl}/subscriptions?checkout=paypal`,
          cancel_url: `${appUrl}/subscriptions?checkout=cancelled`,
          user_action: "PAY_NOW",
        },
      }),
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
  } catch (error) {
    const { error: saveError } = await supabase.from("subscription_payments").update({ status: "failed" }).eq("id", payment.id).eq("status", "pending");
    console.error("PayPal order creation failed:", error instanceof Error ? error.message : "Network error.", saveError?.message);
    return NextResponse.json({ error: "PayPal checkout is temporarily unavailable. Please try again." }, { status: 502 });
  }
  const result = await response.json().catch(() => null) as {
    id?: string; links?: { rel?: string; href?: string }[]; message?: string;
  } | null;
  const approvalUrl = result?.links?.find((link) => link.rel === "approve")?.href;
  if (!response.ok || !result?.id || !approvalUrl) {
    const { error: saveError } = await supabase.from("subscription_payments").update({ status: "failed" }).eq("id", payment.id).eq("status", "pending");
    console.error("PayPal order creation rejected:", result?.message ?? response.statusText, saveError?.message);
    return NextResponse.json({ error: "Could not start PayPal checkout. Please try again later." }, { status: 502 });
  }
  const { error: orderSaveError } = await supabase.from("subscription_payments")
    .update({ provider_reference: result.id }).eq("id", payment.id).eq("payment_provider", "paypal");
  if (orderSaveError) {
    console.error("PayPal order was created but could not be linked to the pending payment:", orderSaveError.message);
    return NextResponse.json({ error: "PayPal order was created but could not be registered. Contact support before trying again." }, { status: 500 });
  }
  return NextResponse.json({ url: approvalUrl, reference: result.id, orderId: result.id });
}
