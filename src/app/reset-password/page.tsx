"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AuthCard, AuthField, authButtonClass } from "@/components/auth-card";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password"));
    if (password !== String(form.get("confirm"))) {
      setError("The two passwords do not match.");
      setBusy(false);
      return;
    }
    try {
      const { error: updateError } = await createClient().auth.updateUser({ password });
      if (updateError) throw updateError;
      router.replace("/dashboard");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update your password.");
      setBusy(false);
    }
  }

  // This route is not public: the middleware only lets a signed-in session
  // (the one created by the emailed recovery link) reach it.
  return (
    <AuthCard title="Choose a new password" description="Use at least 8 characters. You will be signed in once it is saved.">
      <form onSubmit={submit} className="mt-7 space-y-4">
        <AuthField label="New password" name="password" type="password" minLength={8} />
        <AuthField label="Confirm new password" name="confirm" type="password" minLength={8} />
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
        <button disabled={busy} className={authButtonClass}>{busy ? "Please wait…" : "Save new password"}</button>
      </form>
    </AuthCard>
  );
}
