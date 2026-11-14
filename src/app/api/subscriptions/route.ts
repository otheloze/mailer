import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const [packages, subscription, balances, payments, transactions, account, usage] = await Promise.all([
    supabase.from("subscription_packages").select("id,slug,name,price_cents,paystack_price_kobo,email_sending_credits,email_discovery_credits,duration_days,rollover_policy").eq("enabled", true).order("price_cents"),
    supabase.from("client_subscriptions").select("id,status,started_at,expires_at,last_payment_at,package:subscription_packages(id,slug,name,price_cents,paystack_price_kobo,email_sending_credits,email_discovery_credits,duration_days,rollover_policy)").eq("user_id", user.id).maybeSingle(),
    supabase.from("credit_balances").select("email_sending,email_discovery,updated_at").eq("user_id", user.id).maybeSingle(),
    supabase.from("subscription_payments").select("id,amount_cents,refunded_cents,currency,status,payment_provider,provider_reference,stripe_checkout_session,paid_at,created_at,package:subscription_packages(name,slug)").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
    supabase.from("credit_transactions").select("id,service,amount,balance_after,transaction_type,reference_key,related_reference,note,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
    supabase.from("client_account_controls").select("status,note").eq("user_id", user.id).maybeSingle(),
    supabase.rpc("get_subscription_credit_usage"),
  ]);
  const error = packages.error || subscription.error || balances.error || payments.error || transactions.error || account.error || usage.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const isDemo = user.app_metadata?.role === "demo";
  const currentBalances = balances.data ?? { email_sending: 0, email_discovery: 0 };
  const currentUsage = usage.data ?? { email_sending: 0, email_discovery: 0 };
  if (isDemo) {
    currentUsage.email_sending = Math.max(0, 100 - currentBalances.email_sending);
    currentUsage.email_discovery = Math.max(0, 10 - currentBalances.email_discovery);
  }
  return NextResponse.json({
    packages: packages.data ?? [],
    subscription: subscription.data,
    balances: currentBalances,
    payments: payments.data ?? [],
    transactions: transactions.data ?? [],
    account: account.data ?? { status: "active", note: null },
    usage: currentUsage,
    isDemo,
    user: { id: user.id, email: user.email ?? "" },
  });
}
