"use client";

import { useState } from "react";
import { CheckCircle2, Send } from "lucide-react";

const field = "h-11 w-full rounded-xl border border-[#dfe5ef] bg-[#fbfcfe] px-3.5 text-[14px] outline-none transition focus:border-[#7590e9] focus:bg-white focus:ring-4 focus:ring-[#5675e5]/10";

export function ContactForm() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setStatus("sending");
    setError("");
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not send your message.");
      form.reset();
      setStatus("sent");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not send your message.");
      setStatus("idle");
    }
  }

  if (status === "sent") {
    return <div className="grid place-items-center gap-3 rounded-2xl border border-[#d6efe0] bg-[#f3fbf6] px-6 py-12 text-center">
      <CheckCircle2 className="text-[#16a34a]" size={32} />
      <h3 className="text-[18px] font-semibold text-[#14532d]">Message sent</h3>
      <p className="max-w-sm text-[14px] leading-5 text-[#3f6b50]">Thanks for getting in touch. Our team will reply to your email address soon.</p>
      <button onClick={() => setStatus("idle")} className="mt-2 text-[13px] font-semibold text-[#2f4fbf] hover:underline">Send another message</button>
    </div>;
  }

  return <form onSubmit={submit} className="grid gap-4">
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="grid gap-1.5 text-[13px] font-semibold text-[#53617b]">Your name<input name="name" required maxLength={120} autoComplete="name" className={field} /></label>
      <label className="grid gap-1.5 text-[13px] font-semibold text-[#53617b]">Email address<input name="email" type="email" required maxLength={254} autoComplete="email" className={field} /></label>
    </div>
    <label className="grid gap-1.5 text-[13px] font-semibold text-[#53617b]">Subject<input name="subject" required maxLength={160} className={field} /></label>
    <label className="grid gap-1.5 text-[13px] font-semibold text-[#53617b]">How can we help?<textarea name="message" required minLength={10} maxLength={5000} rows={6} className={`${field} h-auto py-3`} /></label>
    {/* Honeypot: hidden from people, filled in by bots. */}
    <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
    {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>}
    <button disabled={status === "sending"} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#233a72] to-[#4a68d8] text-[14px] font-semibold text-white shadow-[0_12px_24px_-12px_rgba(54,82,177,.6)] transition hover:-translate-y-0.5 disabled:opacity-60">
      <Send size={15} /> {status === "sending" ? "Sending…" : "Send message"}
    </button>
  </form>;
}
