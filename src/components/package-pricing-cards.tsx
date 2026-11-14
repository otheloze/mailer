"use client";

import { Check } from "lucide-react";
import { PaymentButtons, type CheckoutStart, type PaymentProvider } from "@/components/payment-buttons";

export type SubscriptionPackage = {
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

export function PackagePricingCards({
  packages,
  email,
  disabled = false,
  start,
  returnPath,
  onError,
}: {
  packages: SubscriptionPackage[];
  email: string;
  disabled?: boolean;
  /** Creates the pending payment server-side and returns provider checkout details. */
  start: (slug: string, provider: PaymentProvider) => Promise<CheckoutStart>;
  /** Page that verifies the payment after the popup closes (e.g. "/pricing"). */
  returnPath: string;
  onError: (message: string) => void;
}) {
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {packages.map((plan) => (
        <article key={plan.id} className={`card-lift relative flex flex-col overflow-hidden rounded-[22px] border bg-white/95 p-5 shadow-[0_16px_44px_-30px_rgba(21,42,90,.25)] sm:p-6 ${plan.slug === "premium" ? "border-[#aabcf2] ring-1 ring-[#dce4ff]" : "border-[#e2e8f0]"}`}>
          {plan.slug === "premium" && <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#4d6cdb] via-[#8ea9ff] to-[#d0a68d]" />}
          {plan.slug === "premium" && <span className="absolute right-4 top-4 rounded-full bg-[#edf1ff] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[.1em] text-[#405bc2]">Best value</span>}
          <h3 className="text-[16px] font-semibold tracking-[-.02em]">{plan.name}</h3>
          <p className="mt-1 text-[13px] text-[#64748b]">Email marketing + verified discovery</p>
          <div className="mt-5 flex items-baseline gap-1">
            <span className="text-[40px] font-semibold leading-none tracking-[-.07em] sm:text-[44px]">{formatCurrency(plan.price_cents, "USD")}</span>
            <span className="text-[13px] text-[#64748b]">/{plan.duration_days} days</span>
          </div>
          <div className="mt-5 space-y-3 border-y border-[#e8edf4] py-4 text-[14px]">
            <div className="flex items-center gap-2"><Check size={16} className="shrink-0 text-[#1d4ed8]" /><span><strong>{number.format(plan.email_sending_credits)}</strong> email sending</span></div>
            <div className="flex items-center gap-2"><Check size={16} className="shrink-0 text-[#1d4ed8]" /><span><strong>{number.format(plan.email_discovery_credits)}</strong> verified-discovery credits</span></div>
          </div>
          <p className="mt-3 text-[13px] text-[#64748b]">{plan.rollover_policy === "rollover" ? "Unused credits roll over" : "Unused credits expire on renewal"}</p>
          <div className="mt-auto pt-5">
            <PaymentButtons
              paystackAmount={formatCurrency(plan.paystack_price_kobo, "NGN")}
              paypalAmount={formatCurrency(plan.price_cents, "USD")}
              disabled={disabled}
              validate={() => validEmail ? null : "Enter a valid email address for your receipt and account first."}
              start={(provider) => start(plan.slug, provider)}
              returnPath={returnPath}
              onError={onError}
            />
          </div>
        </article>
      ))}
    </div>
  );
}

const number = new Intl.NumberFormat("en-US");

function formatCurrency(minor: number, currency: string) {
  return new Intl.NumberFormat(currency === "NGN" ? "en-NG" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "NGN" ? 0 : 2,
  }).format(minor / 100);
}
