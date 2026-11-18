"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { RECOVERY_COOKIE, RECOVERY_MAX_AGE_SECONDS } from "@/lib/password-recovery";
import { AuthCard, AuthField, authButtonClass } from "@/components/auth-card";

export default function ForgotPasswordPage() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const email = String(new FormData(event.currentTarget).get("email")).trim();
    try {
      document.cookie = `${RECOVERY_COOKIE}=1; Max-Age=${RECOVERY_MAX_AGE_SECONDS}; Path=/; SameSite=Lax; Secure`;
      const { error: resetError } = await createClient().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback`,
      });
      if (resetError) throw resetError;
      // Same message whether or not the address has an account, so this page
      // cannot be used to discover which emails are registered.
      setSent(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not send the reset email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Reset your password" description="Enter your account email and we will send you a link to choose a new password.">
      {sent ? (
        <div role="status" className="mt-7 rounded-xl border border-[#cfe0f7] bg-[#f1f6fe] px-4 py-3 text-[13px] leading-5 text-[#26415f]">
          If an account exists for that email, a reset link is on its way. Open it in this same browser, and check your spam folder if it does not arrive within a few minutes.
        </div>
      ) : (
        <form onSubmit={submit} className="mt-7 space-y-4">
          <AuthField label="Email address" name="email" type="email" />
          {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
          <button disabled={busy} className={authButtonClass}>{busy ? "Please wait…" : "Send reset link"}</button>
        </form>
      )}
    </AuthCard>
  );
}
