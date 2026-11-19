"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AuthField, authButtonClass } from "@/components/auth-card";

export function SignupForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const { data, error: signupError } = await createClient().auth.signUp({
        email: String(form.get("email")).trim(),
        password: String(form.get("password")),
        options: {
          data: { full_name: String(form.get("name")).trim() },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (signupError) throw signupError;
      if (data.session) {
        window.location.assign("/dashboard");
        return;
      }
      setNotice("Account created. Check your inbox and confirm your email to start your free trial.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create your account.");
    } finally {
      setBusy(false);
    }
  }

  if (notice) return <div role="status" className="mt-6 rounded-xl border border-[#d6efe0] bg-[#f3fbf6] px-4 py-3 text-[14px] leading-5 text-[#2f6b47]">{notice}</div>;

  return <form onSubmit={submit} className="mt-6 space-y-4">
    <AuthField label="Full name" name="name" />
    <AuthField label="Email address" name="email" type="email" />
    <AuthField label="Password (8+ characters)" name="password" type="password" minLength={8} />
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
    <button disabled={busy} className={authButtonClass}>{busy ? "Creating account…" : "Create account & start free trial"}</button>
    <p className="text-center text-[12px] leading-5 text-muted">Your trial includes 1 test email and 1 discovery. No card needed. <Link href="/pricing" className="font-semibold text-[#405fca] hover:underline">See plans</Link></p>
  </form>;
}
