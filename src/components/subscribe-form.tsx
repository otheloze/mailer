"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";

export function SubscribeForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not start checkout.");
      if (typeof result.url !== "string") throw new Error("Checkout did not return a payment link.");
      window.location.assign(result.url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not start checkout.");
      setBusy(false);
    }
  }

  return <form onSubmit={submit} className="pt-5">
    <label htmlFor="subscription-email" className="mb-1.5 block text-[13px] font-medium text-[#475569]">Email address for your mailbox</label>
    <input id="subscription-email" name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="h-11 w-full rounded-xl border border-[#dbe2ea] bg-white px-3.5 text-[14px] outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#3b82f6]/40" />
    {error && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[14px] text-red-700">{error}</p>}
    <button disabled={busy} className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#1d4ed8] text-[14px] font-semibold text-white transition hover:bg-[#1e40af] disabled:cursor-wait disabled:opacity-60">
      {busy ? <><LoaderCircle size={15} className="animate-spin" /> Connecting to secure checkout…</> : <>Continue to secure checkout <ArrowRight size={15} /></>}
    </button>
  </form>;
}
