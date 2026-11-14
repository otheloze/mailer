"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BadgeCheck, CheckCircle2, Crosshair, FileSpreadsheet, LoaderCircle, Mail, ShieldCheck } from "lucide-react";
import { PaymentButtons, requestCheckout, type PaymentProvider } from "@/components/payment-buttons";

export type LeadPackage = { id: string; slug: string; name: string; lead_count: number; price_cents: number; paystack_price_kobo: number };
type Callback = { checkout?: string; reference?: string };
type Confirmed = { orderId: string; email: string; leadCount: number; amountMinor: number; currency: string };

const number = new Intl.NumberFormat("en-US");
const money = (minor: number, currency: string) =>
  new Intl.NumberFormat(currency === "NGN" ? "en-NG" : "en-US", { style: "currency", currency, maximumFractionDigits: currency === "NGN" ? 0 : 2 }).format(minor / 100);

export function LeadDataStore({ packages, loadError, callback }: { packages: LeadPackage[]; loadError?: string; callback: Callback }) {
  const [email, setEmail] = useState("");
  const [targeting, setTargeting] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [confirmed, setConfirmed] = useState<Confirmed | null>(null);
  const messages = useRef<HTMLDivElement>(null);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const bestPerThousand = packages.length ? Math.min(...packages.map((plan) => plan.price_cents / (plan.lead_count / 1000))) : 0;

  // Returning from PayPal/Paystack (popup success or hosted redirect): confirm with the server.
  useEffect(() => {
    if (callback.checkout === "cancelled") { setNotice("Checkout was cancelled. No payment was taken."); return; }
    const provider = callback.checkout === "paypal" || callback.checkout === "paystack" ? callback.checkout : null;
    if (!provider || !callback.reference) return;
    let active = true;
    setVerifying(true);
    void fetch("/api/lead-orders/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider, reference: callback.reference }),
    }).then(async (response) => {
      const result = await response.json() as Partial<Confirmed> & { paid?: boolean; pending?: boolean; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not confirm your payment.");
      if (!active) return;
      if (result.paid && result.orderId) {
        setConfirmed(result as Confirmed);
        window.history.replaceState(null, "", "/lead-data");
      } else {
        setNotice("Your payment is still processing. Refresh this page in a minute.");
      }
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Could not confirm your payment.");
    }).finally(() => { if (active) setVerifying(false); });
    return () => { active = false; };
  }, [callback.checkout, callback.reference]);

  function showError(message: string) {
    setNotice("");
    setError(message);
    requestAnimationFrame(() => messages.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  function startCheckout(packageSlug: string, provider: PaymentProvider) {
    setError(""); setNotice("");
    return requestCheckout("/api/lead-orders/checkout", { packageSlug, provider, email: email.trim(), targeting: targeting.trim() });
  }

  if (confirmed) {
    return <main className="mx-auto max-w-[640px] px-5 py-16">
      <div className="rounded-3xl border border-[#e2e8f0] bg-white p-8 text-center shadow-[0_24px_70px_-45px_rgba(27,40,80,.35)] sm:p-10">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><CheckCircle2 size={26} /></span>
        <h1 className="mt-5 text-[28px] font-semibold tracking-[-.05em]">Payment confirmed</h1>
        <p className="mt-2 text-[15px] leading-6 text-[#64748b]">
          Thank you. Your order for <strong className="text-[#111827]">{number.format(confirmed.leadCount)} verified email leads</strong> ({money(confirmed.amountMinor, confirmed.currency)}) is in.
        </p>
        <div className="mt-6 rounded-2xl bg-[#f8fafc] p-4 text-left text-[14px] leading-6 text-[#475569]">
          <div><span className="text-[#94a3b8]">Order</span> <strong className="text-[#111827]">#{confirmed.orderId.slice(0, 8).toUpperCase()}</strong></div>
          <div><span className="text-[#94a3b8]">Delivery to</span> <strong className="text-[#111827]">{confirmed.email}</strong></div>
          <p className="mt-2">Our team will contact you at this address to confirm your targeting and deliver your lead file. Keep your order number for reference.</p>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/" className="inline-flex h-11 items-center rounded-full bg-[#162544] px-5 text-[14px] font-semibold text-white">Back to home</Link>
          <Link href="/pricing" className="inline-flex h-11 items-center rounded-full border border-[#d8e1eb] px-5 text-[14px] font-semibold text-[#334155]">Get email sending credits</Link>
        </div>
      </div>
    </main>;
  }

  return <main>
    <section className="mx-auto max-w-[1180px] px-5 pb-6 pt-10 sm:px-8 sm:pt-14">
      <div className="grid gap-8 lg:grid-cols-[1.15fr_.85fr] lg:items-end">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#d9e4f2] bg-white px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[.14em] text-[#1e3a5f]"><BadgeCheck size={13} className="text-[#1d4ed8]" /> Verified lead data</span>
          <h1 className="mt-4 max-w-[640px] text-[clamp(2.2rem,4.6vw,3.6rem)] font-semibold leading-[1.02] tracking-[-.065em] text-[#111c34]">Verified business email leads, ready for outreach.</h1>
          <p className="mt-4 max-w-[540px] text-[15px] leading-7 text-[#64748b]">Choose a package, tell us who you want to reach, and pay securely with PayPal or Paystack. We deliver a verified lead file targeted to your market.</p>
        </div>
        <ul className="grid gap-2.5 text-[14px] text-[#334155]">
          {[
            [ShieldCheck, "Every email address verified before delivery"],
            [Crosshair, "Targeted by industry, location or job title"],
            [FileSpreadsheet, "Delivered as a ready-to-use CSV file"],
          ].map(([Icon, label]) => {
            const I = Icon as typeof ShieldCheck;
            return <li key={label as string} className="flex items-center gap-3 rounded-2xl border border-[#e7ecf3] bg-white px-4 py-3 shadow-sm"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#eef3ff] text-[#1d4ed8]"><I size={16} /></span>{label as string}</li>;
          })}
        </ul>
      </div>
    </section>

    <section className="mx-auto max-w-[1180px] px-5 pb-16 sm:px-8">
      <div className="rounded-3xl border border-[#e2e8f0] bg-white p-5 shadow-[0_16px_50px_-34px_rgba(21,42,90,.3)] sm:p-6">
        <div className="grid gap-4 md:grid-cols-[1fr_1.4fr]">
          <label className="grid gap-1.5 text-[14px] font-semibold text-[#344054]">
            <span className="flex items-center gap-2"><span className="grid size-5 place-items-center rounded-full bg-[#1d4ed8] text-[11px] text-white">1</span> Delivery email</span>
            <input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} placeholder="you@company.com" autoComplete="email" maxLength={254}
              className="h-11 rounded-xl border border-[#dbe2ea] px-3 text-[15px] font-normal outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#3b82f6]/25" />
            <span className="text-[12px] font-normal text-[#64748b]">Your receipt and lead file are sent here.</span>
          </label>
          <label className="grid gap-1.5 text-[14px] font-semibold text-[#344054]">
            <span className="flex items-center gap-2"><span className="grid size-5 place-items-center rounded-full bg-[#1d4ed8] text-[11px] text-white">2</span> Who do you want to reach? <span className="font-normal text-[#94a3b8]">(optional)</span></span>
            <textarea value={targeting} onChange={(event) => setTargeting(event.target.value)} maxLength={500} rows={2} placeholder="e.g. Real estate agencies in Lagos and Abuja; HR managers at tech companies in the UK"
              className="min-h-11 resize-y rounded-xl border border-[#dbe2ea] px-3 py-2.5 text-[15px] font-normal outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#3b82f6]/25" />
            <span className="text-[12px] font-normal text-[#64748b]">We confirm the details with you by email before delivery.</span>
          </label>
        </div>
      </div>

      <div ref={messages} className="mt-4 space-y-2" aria-live="polite">
        {verifying && <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-[14px] text-blue-900"><LoaderCircle size={15} className="animate-spin" /> Confirming your payment with the provider…</div>}
        {notice && <div role="status" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-[14px] text-blue-900">{notice}</div>}
        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] text-red-800">{error}</div>}
        {loadError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] text-red-800">{loadError}</div>}
      </div>

      <div className="mt-4 flex items-center gap-2 text-[14px] font-semibold text-[#344054]"><span className="grid size-5 place-items-center rounded-full bg-[#1d4ed8] text-[11px] text-white">3</span> Choose a package and pay</div>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {packages.map((plan, index) => {
          const perThousand = plan.price_cents / (plan.lead_count / 1000);
          const badge = perThousand === bestPerThousand && packages.length > 1 ? "Best value" : index === 1 ? "Popular" : "";
          return <article key={plan.id} className={`card-lift relative flex flex-col overflow-hidden rounded-[22px] border bg-white p-5 shadow-[0_16px_44px_-30px_rgba(21,42,90,.25)] sm:p-6 ${badge === "Best value" ? "border-[#aabcf2] ring-1 ring-[#dce4ff]" : "border-[#e2e8f0]"}`}>
            {badge === "Best value" && <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#4d6cdb] via-[#8ea9ff] to-[#d0a68d]" />}
            {badge && <span className="absolute right-4 top-4 rounded-full bg-[#edf1ff] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[.1em] text-[#405bc2]">{badge}</span>}
            <span className="grid size-10 place-items-center rounded-xl bg-[#eef3ff] text-[#1d4ed8]"><Mail size={18} /></span>
            <div className="mt-4 text-[34px] font-semibold leading-none tracking-[-.06em]">{number.format(plan.lead_count)}</div>
            <div className="mt-1 text-[14px] text-[#64748b]">verified email leads</div>
            <div className="mt-5 space-y-2 border-y border-[#e8edf4] py-4 text-[14px]">
              <div className="flex items-baseline justify-between"><span className="text-[#64748b]">PayPal</span><strong className="text-[18px] tracking-[-.02em]">{money(plan.price_cents, "USD")}</strong></div>
              <div className="flex items-baseline justify-between"><span className="text-[#64748b]">Paystack</span><strong className="text-[18px] tracking-[-.02em]">{money(plan.paystack_price_kobo, "NGN")}</strong></div>
            </div>
            <p className="mt-3 text-[12px] text-[#64748b]">{money(perThousand, "USD")} per 1,000 leads</p>
            <div className="mt-auto pt-5">
              <PaymentButtons
                paystackAmount={money(plan.paystack_price_kobo, "NGN")}
                paypalAmount={money(plan.price_cents, "USD")}
                disabled={Boolean(loadError)}
                validate={() => validEmail ? null : "Enter your delivery email address first (step 1)."}
                start={(provider) => startCheckout(plan.slug, provider)}
                returnPath="/lead-data"
                onError={showError}
              />
            </div>
          </article>;
        })}
      </div>

      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {[
          ["Choose and pay", "Pick a package size and pay in USD with PayPal or in NGN with Paystack."],
          ["We confirm your targeting", "Our team reviews your target market and confirms it with you by email."],
          ["Receive your verified file", "Get a CSV of verified business email addresses, ready to import into your tools."],
        ].map(([title, detail], index) => <div key={title} className="rounded-2xl border border-[#e7ecf3] bg-white p-5">
          <div className="text-[12px] font-semibold uppercase tracking-[.14em] text-[#1d4ed8]">Step {index + 1}</div>
          <div className="mt-2 text-[16px] font-semibold tracking-[-.02em]">{title}</div>
          <p className="mt-1.5 text-[14px] leading-6 text-[#64748b]">{detail}</p>
        </div>)}
      </div>

      <p className="mx-auto mt-8 max-w-[760px] text-center text-[12px] leading-5 text-[#94a3b8]">
        Lead data is for business-to-business prospecting. Use it in line with applicable anti-spam and data protection laws (such as the NDPR, GDPR and CAN-SPAM). Purchased leads are not opted-in subscribers: record consent before adding anyone to a marketing audience.
      </p>
    </section>
  </main>;
}
