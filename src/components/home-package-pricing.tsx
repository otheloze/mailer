"use client";

import { useState } from "react";
import { PackagePricingCards, type SubscriptionPackage } from "@/components/package-pricing-cards";
import { requestCheckout, type PaymentProvider } from "@/components/payment-buttons";

export function HomePackagePricing({
  packages,
  loadError,
}: {
  packages: SubscriptionPackage[];
  loadError?: string;
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  function startCheckout(packageSlug: string, provider: PaymentProvider) {
    setError("");
    return requestCheckout("/api/guest-subscriptions/checkout", { packageSlug, provider, email });
  }


  return (
    <div className="mt-10">
      <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[.15em] text-[#405bc2]">Email marketing + discovery</p>
          <h3 className="mt-2 text-[26px] font-semibold tracking-[-.045em] text-[#17233d] sm:text-[32px]">Choose your growth package</h3>
          <p className="mt-2 max-w-xl text-[14px] leading-5 text-[#64748b]">Every package includes mass email-sending and verified email-discovery credits.</p>
        </div>
        <label htmlFor="home-checkout-email" className="grid w-full max-w-[360px] gap-1.5 text-[13px] font-semibold text-[#344054]">
          Email for your receipt and account
          <input
            id="home-checkout-email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            value={email}
            onChange={(event) => { setEmail(event.target.value); setError(""); }}
            placeholder="you@company.com"
            className="h-11 rounded-xl border border-[#dbe2ea] bg-white px-3 text-[15px] font-normal outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#3b82f6]/30"
          />
        </label>
      </div>
      {loadError && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] text-red-800">{loadError}</p>}
      {!loadError && packages.length === 0 && <p role="status" className="mb-4 rounded-xl border border-[#dbe4f1] bg-white px-4 py-4 text-[14px] text-[#64748b]">No packages are available right now.</p>}
      {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] text-red-800">{error}</p>}
      {packages.length > 0 && <PackagePricingCards packages={packages} email={email} disabled={Boolean(loadError)} start={startCheckout} returnPath="/pricing" onError={setError} />}
    </div>
  );
}
