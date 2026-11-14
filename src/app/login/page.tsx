"use client";

import Link from "next/link";
import Image from "next/image";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const supabase = createClient();
      const email = String(form.get("email"));
      const password = String(form.get("password"));
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      if (new URLSearchParams(window.location.search).get("claim") === "1") {
        const claimResponse = await fetch("/api/guest-subscriptions/claim", { method: "POST" });
        const claimResult = await claimResponse.json() as { error?: string };
        if (!claimResponse.ok) throw new Error(claimResult.error ?? "Could not activate your verified package.");
      }
      router.replace("/dashboard");
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not authenticate."); }
    finally { setBusy(false); }
  }

  return <main className="grid min-h-screen bg-[#f7f8fb] lg:grid-cols-[1.05fr_.95fr] dark:bg-[#111827]">
    <div className="image-zoom relative hidden min-h-screen overflow-hidden bg-[#111b32] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
      <Image
        src="/images/team-meeting.jpg"
        alt="Business professionals collaborating in a bright, contemporary office"
        fill
        priority
        sizes="(max-width: 1024px) 0px, 52vw"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-br from-[#101a31]/85 via-[#15264b]/48 to-[#101a31]/90" />
      <div className="absolute inset-0 grid-paper opacity-25" />
      <Link href="/" className="relative flex items-center gap-3"><span className="grid size-10 place-items-center rounded-[14px] bg-gradient-to-br from-[#78a8ff] to-[#4057db] shadow-lg"><Send size={17} /></span><span className="text-[13px] font-semibold tracking-[.04em]">MYMAILMARKET</span></Link>
      <div className="relative max-w-[540px]">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/[.08] px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[.17em] text-[#d3e1ff] backdrop-blur-md"><span className="size-1.5 rounded-full bg-[#9bb8ff]" /> Email that feels personal</div>
        <h1 className="text-[clamp(2.8rem,5vw,4.6rem)] font-semibold leading-[1.02] tracking-[-.065em]">Make every<br />message matter.</h1>
        <p className="mt-5 max-w-sm text-[13px] leading-6 text-white/70">A thoughtful workspace for finding the right people and building stronger relationships with your audience.</p>
        <div className="mt-8 flex flex-wrap gap-2"><span className="rounded-full border border-white/20 bg-white/[.07] px-3 py-1.5 text-[12px] text-white/75">Resend-powered delivery</span><span className="rounded-full border border-white/20 bg-white/[.07] px-3 py-1.5 text-[12px] text-white/75">Built for focus</span></div>
      </div>
      <p className="relative text-[12px] text-white/55">© 2026 MYMAILMARKET. Built for your workspace.</p>
    </div>
    <div className="flex min-h-screen items-center justify-center px-6 py-10 sm:px-10"><div className="w-full max-w-[390px] rounded-[26px] border border-white bg-white/90 p-6 shadow-[0_30px_90px_-56px_rgba(18,34,72,.25)] sm:p-9 dark:border-[#2a3955] dark:bg-[#17233d]">
      <div className="mb-8 flex items-center gap-3 lg:hidden"><span className="grid size-9 place-items-center rounded-[13px] bg-gradient-to-br from-[#78a8ff] to-[#4057db] text-white"><Send size={16} /></span><span className="text-[13px] font-semibold tracking-[.035em]">MYMAILMARKET</span></div>
      <div className="mb-6 hidden h-1 w-12 rounded-full bg-gradient-to-r from-[#4c6de0] to-[#a5bdff] lg:block" />
      <h2 className="text-[26px] font-semibold tracking-[-.05em] text-[#17233d] dark:text-white">Welcome back</h2><p className="mt-2 text-[14px] text-muted">Sign in to your MYMAILMARKET workspace.</p>
      <form onSubmit={submit} className="mt-7 space-y-4"><Field label="Email address" name="email" type="email" required /><Field label="Password" name="password" type="password" required minLength={8} />
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
        <button disabled={busy} className="h-11 w-full rounded-xl bg-gradient-to-r from-[#233a72] to-[#4a68d8] text-[14px] font-semibold text-white shadow-[0_12px_24px_-12px_rgba(54,82,177,.6)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_30px_-12px_rgba(54,82,177,.55)] disabled:opacity-60">{busy ? "Please wait…" : "Sign in"}</button>
      </form><div className="mt-5 text-center text-[14px] text-muted">New to MYMAILMARKET? <Link href="/pricing" className="font-semibold text-[#405fca] hover:underline">Choose a package</Link> before creating your account.</div>
      <p className="mt-8 text-center text-[13px] leading-5 text-muted">By continuing, you agree to use this workspace in accordance with applicable email and privacy laws.</p>
      <Link href="/unsubscribe" className="mt-5 block text-center text-[13px] text-[#8994a9] hover:text-[#405fca]">Email preferences</Link>
    </div></div>
  </main>;
}
function Field({ label, name, type = "text", required = false, minLength }: { label: string; name: string; type?: string; required?: boolean; minLength?: number }) {
  return <label className="grid gap-1.5 text-[13px] font-semibold text-[#53617b] dark:text-[#c0cbe0]">{label}<input name={name} type={type} required={required} minLength={minLength} className="h-11 rounded-xl border border-[#dfe5ef] bg-[#fbfcfe] px-3.5 text-[14px] outline-none transition focus:border-[#7590e9] focus:bg-white focus:ring-4 focus:ring-[#5675e5]/10 dark:border-[#35445f] dark:bg-[#121d33] dark:text-white dark:focus:bg-[#14203a]" /></label>;
}
