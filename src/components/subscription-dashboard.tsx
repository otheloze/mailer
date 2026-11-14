"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDownToLine, CreditCard, LoaderCircle, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { PaymentButtons, requestCheckout, type PaymentProvider } from "@/components/payment-buttons";

type Package = {
  id: string;
  slug: string;
  name: string;
  price_cents: number;
  paystack_price_kobo: number;
  email_sending_credits: number;
  email_discovery_credits: number;
  duration_days: number;
  rollover_policy: "expire" | "rollover";
};
type PageData = {
  packages: Package[];
  isDemo: boolean;
  subscription: null | {
    id: string; status: string; started_at: string; expires_at: string;
    package: Package | Package[] | null;
  };
  balances: { email_sending: number; email_discovery: number };
  payments: { id: string; amount_cents: number; refunded_cents: number; currency: string; status: string; payment_provider: string; provider_reference: string | null; stripe_checkout_session: string | null; paid_at: string | null; created_at: string; package: { name: string; slug: string } | { name: string; slug: string }[] | null }[];
  transactions: { id: string; service: string; amount: number; transaction_type: string; note: string | null; created_at: string }[];
  account: { status: string; note: string | null };
  usage: { email_sending: number; email_discovery: number };
  user: { id: string; email: string };
};

const number = new Intl.NumberFormat("en-US");
const date = (value: string | null) => value ? new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";
const money = (minor: number, currency = "USD") => new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 2 }).format(minor / 100);
const relatedPackage = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] ?? null : value;

export function SubscriptionDashboard() {
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [checkoutSession, setCheckoutSession] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/subscriptions", { cache: "no-store" });
      const result = await response.json() as PageData & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not load subscription details.");
      setData(result);
      setLoading(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load subscription details.");
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const checkout = params.get("checkout");
    if (checkout === "cancelled") setNotice("Checkout was canceled; no payment was made.");
    if (checkout === "paypal" && params.get("token")) {
      const orderId = params.get("token")!;
      setNotice("Verifying your PayPal payment…");
      void fetch("/api/subscriptions/paypal/capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId }),
      }).then(async (response) => {
        const result = await response.json() as { paid?: boolean; pending?: boolean; error?: string };
        if (!response.ok) throw new Error(result.error ?? "Could not verify the PayPal payment.");
        setNotice(result.paid ? "PayPal payment confirmed. Your package is active." : "PayPal payment is still processing. Refresh shortly.");
        await refresh();
      }).catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Could not verify the PayPal payment.");
      });
    } else if (checkout === "paystack" && (params.get("reference") || params.get("trxref"))) {
      const reference = params.get("reference") ?? params.get("trxref")!;
      setNotice("Verifying your Paystack payment…");
      void fetch("/api/subscriptions/paystack/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reference }),
      }).then(async (response) => {
        const result = await response.json() as { paid?: boolean; pending?: boolean; error?: string };
        if (!response.ok) throw new Error(result.error ?? "Could not verify the Paystack payment.");
        setNotice(result.paid ? "Paystack payment confirmed. Your package is active." : "Paystack payment is still processing. Refresh shortly.");
        await refresh();
      }).catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Could not verify the Paystack payment.");
      });
    } else if (checkout === "success" && sessionId) {
      setCheckoutSession(sessionId);
      setNotice("Payment received. Waiting for verified payment confirmation to activate credits…");
      let attempts = 0;
      const timer = window.setInterval(() => {
        attempts += 1;
        void refresh();
        if (attempts >= 10) window.clearInterval(timer);
      }, 2500);
      return () => window.clearInterval(timer);
    }
  }, [refresh]);

  const subscriptionPackage = relatedPackage(data?.subscription?.package ?? null);
  function startCheckout(packageSlug: string, provider: PaymentProvider) {
    setError(""); setNotice("");
    return requestCheckout("/api/subscriptions/checkout", { packageSlug, provider });
  }


  if (loading) return <div className="grid min-h-48 place-items-center rounded-xl border border-line bg-white dark:border-[#2a2a27] dark:bg-[#171716]"><LoaderCircle className="animate-spin text-[#1d4ed8]" size={20} /></div>;
  if (!data) return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error || "Subscription data is unavailable."}</div>;
  const effectivelyActive = data.subscription?.status === "active" && Date.parse(data.subscription.expires_at) > Date.now();

  return <div className="space-y-5">
    {notice && <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900"><span>{notice}{checkoutSession && data.payments.some((payment) => (payment.provider_reference === checkoutSession || payment.stripe_checkout_session === checkoutSession) && payment.status === "paid") ? " Your account has been refreshed." : ""}</span><button onClick={() => void refresh()} className="inline-flex shrink-0 items-center gap-1 font-semibold"><RefreshCw size={13} />Refresh</button></div>}
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">{error}</div>}
    {data.account.status !== "active" && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">Account status: {data.account.status}. {data.account.note || "Service use and package purchases are disabled; contact an administrator."}</div>}

    <section className="rounded-2xl border border-[#dbe4f1] bg-gradient-to-br from-[#102a43] via-[#173b66] to-[#1d4ed8] p-5 text-white shadow-sm sm:p-7">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[12px] font-semibold uppercase tracking-[.12em] text-white/75"><ShieldCheck size={12} /> Combined service package</div>
          <h2 className="mt-4 text-[24px] font-semibold tracking-[-.045em]">{data.isDemo ? "Demo access" : subscriptionPackage?.name ?? "No active package"}</h2>
          <p className="mt-1 text-[14px] text-white/65">{data.isDemo ? "No subscription required · 100 email sends and 10 discovery credits" : effectivelyActive ? "Your subscription is active" : data.subscription?.status === "suspended" ? "Subscription is suspended" : data.subscription ? "Subscription is expired or inactive" : "Choose a package to activate both services."}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-[13px] sm:min-w-[280px]">
          <div className="rounded-xl border border-white/10 bg-white/10 p-3"><div className="text-white/55">Started</div><div className="mt-1 font-medium">{date(data.subscription?.started_at ?? null)}</div></div>
          <div className="rounded-xl border border-white/10 bg-white/10 p-3"><div className="text-white/55">Expires</div><div className="mt-1 font-medium">{date(data.subscription?.expires_at ?? null)}</div></div>
        </div>
      </div>
    </section>

    <section aria-label="Credit balances" className="grid gap-3 sm:grid-cols-2">
      {([
        ["email_sending", "Email sending credits", "Email campaign recipients and test sends"],
        ["email_discovery", "Verified email discovery credits", "Company discovery, domain search and verification"],
      ] as const).map(([key, title, caption]) => (
        <article key={key} className="rounded-xl border border-line bg-white p-4 shadow-soft dark:border-[#2a2a27] dark:bg-[#171716] sm:p-5">
          <div className="flex items-start justify-between gap-3"><div><h3 className="text-[14px] font-semibold">{title}</h3><p className="mt-1 text-[13px] text-muted">{caption}</p></div><span className="grid size-8 place-items-center rounded-lg bg-[#eaf0fb] text-[#1d4ed8]">{key === "email_sending" ? <CreditCard size={15} /> : <Sparkles size={15} />}</span></div>
          <div className="mt-5 grid grid-cols-3 gap-2">
            <div><div className="text-[12px] text-muted">{data.isDemo ? "Demo allowance" : "Package allowance"}</div><div className="mt-1 text-[17px] font-semibold tracking-[-.04em]">{number.format(data.isDemo ? key === "email_sending" ? 100 : 10 : key === "email_sending" ? subscriptionPackage?.email_sending_credits ?? 0 : subscriptionPackage?.email_discovery_credits ?? 0)}</div></div>
            <div><div className="text-[12px] text-muted">Used</div><div className="mt-1 text-[17px] font-semibold tracking-[-.04em]">{number.format(data.usage[key])}</div></div>
            <div><div className="text-[12px] text-muted">Remaining</div><div className="mt-1 text-[17px] font-semibold tracking-[-.04em] text-[#1d4ed8]">{number.format(data.balances[key])}</div></div>
          </div>
        </article>
      ))}
    </section>

    <section>
      <div className="flex flex-wrap items-end justify-between gap-2"><div><h2 className="text-[16px] font-semibold tracking-[-.03em]">Choose or change a package</h2><p className="mt-1 text-[13px] text-muted">One secure payment includes both email sending and verified email discovery.</p></div><p className="text-[12px] text-muted">Term: package duration · manual renewal</p></div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {data.packages.map((plan) => {
          const current = subscriptionPackage?.id === plan.id && effectivelyActive;
          const action = !effectivelyActive ? "Purchase package" : current ? "Renew package" : plan.price_cents > (subscriptionPackage?.price_cents ?? 0) ? "Upgrade package" : "Change package";
          return <article key={plan.id} className={`relative flex flex-col rounded-xl border bg-white p-4 shadow-soft dark:bg-[#171716] sm:p-5 ${plan.slug === "premium" ? "border-[#9db7d7]" : "border-line"} ${current ? "ring-1 ring-[#1d4ed8]" : ""}`}>
            {current && <span className="absolute right-3 top-3 rounded-full bg-[#eaf0fb] px-2 py-1 text-[11px] font-semibold text-[#1e40af]">CURRENT</span>}
            <div className="text-[14px] font-semibold">{plan.name}</div>
            <div className="mt-3 flex items-baseline"><span className="text-[28px] font-semibold tracking-[-.06em]">{money(plan.price_cents, "USD")}</span><span className="ml-1 text-[12px] text-muted">/ {plan.duration_days} days</span></div>
            <div className="mt-4 space-y-2 border-t border-line pt-3 text-[13px]"><div className="flex items-center justify-between gap-2"><span className="text-muted">Email sending</span><strong>{number.format(plan.email_sending_credits)}</strong></div><div className="flex items-center justify-between gap-2"><span className="text-muted">Email discovery</span><strong>{number.format(plan.email_discovery_credits)}</strong></div></div>
            <div className="mt-3 text-[12px] text-muted">Both services included · {plan.rollover_policy === "rollover" ? "Unused credits roll over" : "Unused credits expire on renewal"}</div>
            <div className="mt-auto pt-4">
              <div className="mb-2 text-[12px] font-medium text-muted">{action}</div>
              <PaymentButtons
                paystackAmount={money(plan.paystack_price_kobo, "NGN")}
                paypalAmount={money(plan.price_cents, "USD")}
                disabled={data.account.status !== "active"}
                validate={() => null}
                start={(provider) => startCheckout(plan.slug, provider)}
                returnPath="/subscriptions"
                onError={setError}
              />
            </div>
          </article>;
        })}
      </div>
    </section>

    <section className="grid gap-4 xl:grid-cols-2">
      <div className="overflow-hidden rounded-xl border border-line bg-white shadow-soft dark:border-[#2a2a27] dark:bg-[#171716]">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3"><CreditCard size={15} className="text-[#1d4ed8]" /><h2 className="text-[14px] font-semibold">Payment history</h2></div>
        {data.payments.length ? <div className="divide-y divide-line">{data.payments.map((payment) => <div key={payment.id} className="flex items-center justify-between gap-3 px-4 py-3 text-[13px]"><div><div className="font-medium">{relatedPackage(payment.package)?.name ?? "Package payment"}</div><div className="mt-1 text-muted">{payment.payment_provider} · {date(payment.paid_at ?? payment.created_at)}</div></div><div className="text-right"><div className="font-semibold">{money(payment.amount_cents - payment.refunded_cents, payment.currency)}</div><div className={`mt-1 capitalize ${payment.status === "paid" ? "text-emerald-700" : "text-muted"}`}>{payment.status}</div></div></div>)}</div> : <div className="px-4 py-7 text-center text-[13px] text-muted">No package payments yet.</div>}
      </div>
      <div className="overflow-hidden rounded-xl border border-line bg-white shadow-soft dark:border-[#2a2a27] dark:bg-[#171716]">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3"><ArrowDownToLine size={15} className="text-[#1d4ed8]" /><h2 className="text-[14px] font-semibold">Recent credit activity</h2></div>
        {data.transactions.length ? <div className="max-h-[380px] divide-y divide-line overflow-auto">{data.transactions.slice(0, 30).map((transaction) => <div key={transaction.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[12px]"><div><div className="font-medium">{transaction.note ?? transaction.transaction_type.replace("_", " ")}</div><div className="mt-1 text-muted">{transaction.service === "email_sending" ? "Email sending" : "Email discovery"} · {date(transaction.created_at)}</div></div><span className={`font-semibold ${transaction.amount > 0 ? "text-emerald-700" : ""}`}>{transaction.amount > 0 ? "+" : ""}{number.format(transaction.amount)}</span></div>)}</div> : <div className="px-4 py-7 text-center text-[13px] text-muted">Credit usage and allocations will appear here.</div>}
      </div>
    </section>
  </div>;
}
