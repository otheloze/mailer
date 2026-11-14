import Link from "next/link";
import { Check, Mail } from "lucide-react";

type CheckoutSession = {
  mode?: string;
  payment_status?: string;
  customer_details?: { email?: string | null } | null;
  customer_email?: string | null;
  status?: string;
};

async function getCheckoutSession(id: string): Promise<CheckoutSession | null> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;

  try {
    const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;
    return await response.json() as CheckoutSession;
  } catch {
    return null;
  }
}

export default async function SubscriptionSuccessPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id: sessionId } = await searchParams;
  const session = sessionId && /^cs_(test|live)_[A-Za-z0-9_]+$/.test(sessionId) ? await getCheckoutSession(sessionId) : null;
  const confirmed = session?.mode === "subscription" && session.payment_status === "paid";
  const email = session?.customer_details?.email ?? session?.customer_email;

  return <main className="grid min-h-screen place-items-center bg-[#f4f6fa] px-5 py-12 text-[#111827]">
    <section className="w-full max-w-[480px] rounded-[28px] border border-[#e2e8f0] bg-white p-8 text-center shadow-[0_24px_70px_-45px_rgba(27,30,22,.3)] sm:p-12">
      <span className={`mx-auto grid size-14 place-items-center rounded-2xl ${confirmed ? "bg-[#3b82f6]" : "bg-[#edf2f7]"}`}>{confirmed ? <Check size={25} /> : <Mail size={24} />}</span>
      <h1 className="mt-6 text-[32px] font-semibold tracking-[-.06em]">{confirmed ? "You’re on the list." : "Checkout status"}</h1>
      <p className="mt-3 text-[13px] leading-6 text-[#64748b]">
        {confirmed
          ? `Your $5/month MYMAILMARKET mailbox subscription is active${email ? ` for ${email}` : ""}.`
          : "We couldn’t verify the subscription yet. If you completed payment, check your Stripe receipt or contact us before trying again."}
      </p>
      <Link href="/" className="mt-7 inline-flex h-11 items-center justify-center rounded-full bg-[#102a43] px-6 text-[14px] font-medium text-white transition hover:bg-[#173b66]">Back to MYMAILMARKET</Link>
    </section>
  </main>;
}
