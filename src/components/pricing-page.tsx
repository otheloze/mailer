"use client";

import Link from "next/link";
import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, Flame, LoaderCircle, LockKeyhole, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BLACK_FRIDAY_PROMO, isPromoActive } from "@/lib/promo";
import { PackagePricingCards, type SubscriptionPackage } from "@/components/package-pricing-cards";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { requestCheckout, type PaymentProvider } from "@/components/payment-buttons";

type CallbackState = {
  checkout?: string;
  reference?: string;
  token?: string;
  claimError?: string;
};

export function PricingPage({ packages, loadError, callback }: { packages: SubscriptionPackage[]; loadError?: string; callback: CallbackState }) {
  const [email, setEmail] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState("");
  const [verified, setVerified] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [notice, setNotice] = useState(callback.claimError ?? "");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void createClient().auth.getUser().then(({ data }) => {
      if (active && data.user?.email) {
        setAccountEmail(data.user.email.toLowerCase());
        setEmail(data.user.email.toLowerCase());
      }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (callback.checkout === "cancelled") {
      setNotice("Checkout was cancelled. No payment was confirmed.");
      return;
    }
    const reference = callback.checkout === "paypal" ? callback.token : callback.reference;
    const provider = callback.checkout === "paypal" ? "paypal" : callback.checkout === "paystack" ? "paystack" : null;
    if (!provider || !reference) return;

    let active = true;
    setBusy("verify");
    setNotice("Verifying your payment with the provider…");
    void fetch("/api/guest-subscriptions/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider, reference }),
    }).then(async (response) => {
      const result = await response.json() as { verified?: boolean; claimed?: boolean; pending?: boolean; email?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not verify the payment.");
      if (!active) return;
      if (result.verified && result.email) {
        setEmail(result.email);
        setVerified(true);
        setClaimed(Boolean(result.claimed));
        setNotice(result.claimed ? "Payment verified and package claimed. Sign in to your workspace." : "Payment confirmed. Create your account to activate the package.");
        const { data: { user } } = await createClient().auth.getUser();
        if (user?.email?.toLowerCase() === result.email.toLowerCase()) {
          const claimResponse = await fetch("/api/guest-subscriptions/claim", { method: "POST" });
          const claimResult = await claimResponse.json() as { error?: string };
          if (!claimResponse.ok) throw new Error(claimResult.error ?? "Payment is verified, but package activation is pending.");
          window.location.assign("/dashboard");
        }
      } else {
        setNotice(result.pending ? "The provider is still processing your payment. Refresh this page shortly." : "Payment is not confirmed yet.");
      }
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Could not verify the payment.");
    }).finally(() => {
      if (active) setBusy("");
    });
    return () => { active = false; };
  }, [callback.checkout, callback.reference, callback.token]);

  function startCheckout(packageSlug: string, provider: PaymentProvider) {
    setError("");
    setNotice("");
    return requestCheckout("/api/guest-subscriptions/checkout", { packageSlug, provider, email });
  }


  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!verified) {
      setError("Complete and verify payment before creating an account.");
      return;
    }
    if (accountEmail && accountEmail !== email.toLowerCase()) {
      setError("Sign in with the email address used at checkout to claim this package.");
      return;
    }
    setBusy("signup");
    setError("");
    try {
      const supabase = createClient();
      const { data, error: signupError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (signupError) throw signupError;
      if (data.session) {
        const response = await fetch("/api/guest-subscriptions/claim", { method: "POST" });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Account created, but package activation is pending.");
        window.location.assign("/dashboard");
        return;
      }
      setNotice("Account created. Confirm your email using the link we sent; your verified package will activate when you return.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create your account.");
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_top_right,_rgba(112,151,255,.1),_transparent_34%),#f4f6fa] text-[#101828]">
      <SiteHeader />

      <section className="mx-auto max-w-[1180px] px-5 pb-12 pt-6 sm:px-8 sm:pt-8">
        <div className="relative overflow-hidden rounded-[24px] bg-[#182746] shadow-[0_24px_70px_-48px_rgba(15,35,75,.48)]">
          <Image
            src="/images/team-meeting.jpg"
            alt="Professionals collaborating in a bright, modern office"
            fill
            priority
            sizes="(max-width: 1180px) 100vw, 1120px"
            className="object-cover object-[center_35%]"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#101a31]/95 via-[#101a31]/78 to-[#101a31]/25" />
          <div className="relative flex flex-col justify-center px-6 py-7 text-white sm:px-9 sm:py-8">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/[.08] px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[.16em] text-[#d5e0ff] backdrop-blur-md"><ShieldCheck size={12} /> One package · two services</div>
            <h1 className="mt-3 max-w-[720px] text-[clamp(1.6rem,3.4vw,2.5rem)] font-semibold leading-[1.08] tracking-[-.05em]">One plan for mass email sending<br className="hidden sm:block" /> and verified email discovery.</h1>
            <p className="mt-2 max-w-[560px] text-[14px] leading-6 text-white/75">Every package combines email-sending credits with verified email-discovery credits. Pay securely with PayPal or Paystack, then create your account to activate your package.</p>
          </div>
        </div>

        {/* Hosting is sold in the separate client-area store, so the bundle is
            promoted here where purchase intent is highest rather than priced. */}
        {isPromoActive() && <a
          href={BLACK_FRIDAY_PROMO.href}
          target="_blank"
          rel="noreferrer"
          className="group mt-5 flex flex-col gap-3 rounded-2xl border border-[#f2d5bb] bg-[#fff8f2] px-5 py-4 text-[#3a1d08] transition hover:border-[#e8a86f] hover:bg-[#fff2e6] sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#ffe4cc] text-[#c2410c]"><Flame size={17} /></span>
            <div>
              <div className="text-[14px] font-semibold">Black Friday: {BLACK_FRIDAY_PROMO.headline.toLowerCase()}</div>
              <div className="mt-0.5 text-[12px] leading-4 text-[#8a5a33]">
                {BLACK_FRIDAY_PROMO.prices.map(({ label, currency, price }) => `${currency} ${price} ${label === "Nigeria" ? "in Nigeria" : "internationally"}`).join(" · ")}. Sale ends {BLACK_FRIDAY_PROMO.endsLabel}.
              </div>
            </div>
          </div>
          <span className="inline-flex h-9 w-fit shrink-0 items-center gap-1.5 rounded-full bg-[#c2410c] px-4 text-[13px] font-semibold text-white transition group-hover:bg-[#9a3412]">Claim the deal <ArrowUpRight size={13} /></span>
        </a>}

        {loadError && <div role="alert" className="mx-auto mt-8 max-w-3xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-xs text-red-800">{loadError}</div>}
        {!loadError && packages.length === 0 && <div role="status" className="mx-auto mt-8 max-w-3xl rounded-xl border border-[#dbe4f1] bg-white px-4 py-5 text-center text-xs text-[#64748b]">No packages are available right now.</div>}

        {packages.length > 0 && <>
          <div className="mx-auto mt-8 max-w-[460px] rounded-2xl border border-white bg-white/95 p-4 shadow-[0_16px_50px_-30px_rgba(21,42,90,.26)] sm:p-5">
            <label htmlFor="checkout-email" className="mb-1.5 block text-[14px] font-semibold">Email for your receipt and account</label>
            <input id="checkout-email" type="email" required maxLength={254} autoComplete="email" value={email} readOnly={Boolean(accountEmail)} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" className="h-11 w-full rounded-lg border border-[#dbe2ea] bg-white px-3 text-[14px] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#3b82f6]/30 read-only:bg-[#f8fafc]" />
            <p className="mt-2 text-[12px] leading-4 text-[#64748b]">{accountEmail ? "The signed-in account email will be used to connect your package." : "Use an address you can access. You’ll create your account with this same email after payment is confirmed."}</p>
          </div>

          <PackagePricingCards packages={packages} email={email} disabled={Boolean(loadError)} start={startCheckout} returnPath="/pricing" onError={setError} />
        </>}

        {(notice || error) && <div className="mx-auto mt-6 max-w-[620px] space-y-2">
          {notice && <div role="status" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-[14px] leading-5 text-blue-900">{notice}</div>}
          {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] leading-5 text-red-800">{error}</div>}
        </div>}

        {verified && accountEmail && accountEmail !== email.toLowerCase() && <div className="mx-auto mt-6 max-w-[420px] rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center text-[14px] leading-5 text-amber-900">
          This browser is signed in as a different email. Sign out to create or sign in to the account used at checkout.
          <button type="button" onClick={() => { void createClient().auth.signOut().then(() => window.location.reload()); }} className="mt-2 block w-full font-semibold underline underline-offset-2">Use the checkout email</button>
        </div>}

        {verified && claimed && !accountEmail && <div className="mx-auto mt-6 max-w-[420px] rounded-2xl border border-[#dbe4f1] bg-white p-5 text-center text-[14px] leading-5 text-[#475569]">
          This purchase is already linked to an account. <Link href="/login?claim=1" className="font-semibold text-[#1d4ed8] underline underline-offset-2">Sign in</Link> with {email} to continue.
        </div>}

        {verified && !accountEmail && !claimed && <form onSubmit={createAccount} className="mx-auto mt-6 max-w-[420px] rounded-2xl border border-[#dbe4f1] bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2 text-[14px] font-semibold"><LockKeyhole size={15} className="text-[#1d4ed8]" /> Create your account</div>
          <p className="mt-1 text-[13px] leading-4 text-[#64748b]">Payment is verified. Complete registration with the checkout email to activate your package.</p>
          <div className="mt-4 grid gap-3">
            <label className="grid gap-1.5 text-[13px] font-medium">Full name<input required maxLength={120} value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" className="h-10 rounded-lg border border-[#dbe2ea] px-3 text-[14px] outline-none focus:border-[#2563eb]" /></label>
            <label className="grid gap-1.5 text-[13px] font-medium">Email address<input required type="email" value={email} readOnly className="h-10 rounded-lg border border-[#dbe2ea] bg-[#f8fafc] px-3 text-[14px]" /></label>
            <label className="grid gap-1.5 text-[13px] font-medium">Password<input required type="password" minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" className="h-10 rounded-lg border border-[#dbe2ea] px-3 text-[14px] outline-none focus:border-[#2563eb]" /></label>
          </div>
          <button type="submit" disabled={busy !== ""} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#102a43] text-[14px] font-semibold text-white transition hover:bg-[#173b66] disabled:cursor-wait disabled:opacity-60">
            {busy === "signup" ? <><LoaderCircle size={14} className="animate-spin" /> Creating account…</> : <>Create account and activate package <ArrowRight size={14} /></>}
          </button>
          <p className="mt-3 text-center text-[12px] text-[#64748b]">Already have an account? <Link href="/login?claim=1" className="font-semibold text-[#1d4ed8] hover:underline">Sign in</Link> with this email to claim your purchase.</p>
        </form>}

        <div className="mx-auto mt-9 flex max-w-[720px] items-start justify-center gap-2 text-center text-[12px] leading-4 text-[#64748b]"><ShieldCheck size={13} className="mt-0.5 shrink-0 text-[#1d4ed8]" /><span>Credits are activated only after payment verification and account email confirmation. Package duration and unused-credit terms are shown above.</span></div>
      </section>
      <SiteFooter />
    </main>
  );
}
